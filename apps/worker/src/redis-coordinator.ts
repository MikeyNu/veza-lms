import { randomUUID } from "node:crypto";
import { createConnection as createTcpConnection, type Socket } from "node:net";
import { connect as createTlsConnection, type TLSSocket } from "node:tls";

function command(parts: readonly (string | number)[]): Buffer {
  const chunks: Buffer[] = [Buffer.from(`*${parts.length}\r\n`)];
  for (const part of parts) {
    const value = Buffer.from(String(part), "utf8");
    chunks.push(Buffer.from(`$${value.length}\r\n`), value, Buffer.from("\r\n"));
  }
  return Buffer.concat(chunks);
}

async function readResponse(socket: Socket | TLSSocket, timeoutMs: number): Promise<string | number | null> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => done(new Error("Redis coordination timed out")), timeoutMs);
    const done = (error?: Error, value?: string | number | null) => {
      clearTimeout(timer);
      socket.off("data", data);
      socket.off("error", failed);
      if (error) reject(error);
      else resolve(value ?? null);
    };
    const failed = (error: Error) => done(error);
    const data = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const end = buffer.indexOf("\r\n");
      if (end < 0) return;
      const firstByte = buffer.at(0);
      if (firstByte === undefined) return;
      const type = String.fromCharCode(firstByte);
      const line = buffer.subarray(1, end).toString("utf8");
      if (type === "+") done(undefined, line);
      else if (type === ":") done(undefined, Number(line));
      else if (type === "$") {
        const length = Number(line);
        if (length === -1) done(undefined, null);
        else if (buffer.length >= end + 2 + length + 2) {
          done(undefined, buffer.subarray(end + 2, end + 2 + length).toString("utf8"));
        }
      } else if (type === "-") done(new Error(`Redis error: ${line}`));
      else done(new Error(`Unsupported Redis response type ${type}`));
    };
    socket.on("data", data);
    socket.once("error", failed);
  });
}

async function open(url: URL): Promise<Socket | TLSSocket> {
  const port = Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379));
  const socket = url.protocol === "rediss:"
    ? createTlsConnection({ host: url.hostname, port, servername: url.hostname })
    : createTcpConnection({ host: url.hostname, port });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Redis coordination connection timed out")), 2_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return socket;
}

export class RedisCoordinator {
  private readonly url: URL | undefined;
  private readonly prefix: string;

  constructor(private readonly workerId: string) {
    const raw = process.env.REDIS_URL?.trim();
    this.url = raw ? new URL(raw) : undefined;
    this.prefix = (process.env.REDIS_KEY_PREFIX?.trim() || "veza:local")
      .toLowerCase()
      .replace(/[^a-z0-9._:-]+/g, "-")
      .slice(0, 120);
  }

  async withLock<TResult>(
    lockName: string,
    ttlMilliseconds: number,
    work: () => Promise<TResult>,
  ): Promise<TResult | undefined> {
    if (!this.url) return work();
    const token = `${this.workerId}:${randomUUID()}`;
    const key = `${this.prefix}:worker-lock:${lockName.replace(/[^A-Za-z0-9._:-]+/g, "-")}`;
    const socket = await open(this.url);
    try {
      await this.authenticate(socket);
      socket.write(command(["SET", key, token, "NX", "PX", ttlMilliseconds]));
      const acquired = await readResponse(socket, 2_000);
      if (acquired !== "OK") return undefined;
      try {
        return await work();
      } finally {
        const script = "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
        socket.write(command(["EVAL", script, 1, key, token]));
        await readResponse(socket, 2_000).catch(() => null);
      }
    } finally {
      socket.destroy();
    }
  }

  private async authenticate(socket: Socket | TLSSocket): Promise<void> {
    if (!this.url) return;
    const password = this.url.password ? decodeURIComponent(this.url.password) : undefined;
    const username = this.url.username ? decodeURIComponent(this.url.username) : undefined;
    if (password) {
      socket.write(command(username ? ["AUTH", username, password] : ["AUTH", password]));
      if ((await readResponse(socket, 2_000)) !== "OK") throw new Error("Redis coordination authentication failed");
    }
    const database = Number(this.url.pathname.slice(1) || 0);
    if (database > 0) {
      socket.write(command(["SELECT", database]));
      if ((await readResponse(socket, 2_000)) !== "OK") throw new Error("Redis coordination database selection failed");
    }
  }
}
