import { createConnection as createTcpConnection, type Socket } from "node:net";
import { connect as createTlsConnection, type TLSSocket } from "node:tls";
import { Injectable, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";

export type RedisValue = string | number | null | readonly RedisValue[];

function encodeCommand(parts: readonly (string | number)[]): Buffer {
  const chunks: Buffer[] = [Buffer.from(`*${parts.length}\r\n`)];
  for (const part of parts) {
    const value = Buffer.from(String(part), "utf8");
    chunks.push(Buffer.from(`$${value.length}\r\n`), value, Buffer.from("\r\n"));
  }
  return Buffer.concat(chunks);
}

class RespParser {
  private buffer = Buffer.alloc(0);

  append(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
  }

  parse(): RedisValue | undefined {
    const parsed = this.read(0);
    if (!parsed) return undefined;
    this.buffer = this.buffer.subarray(parsed.offset);
    return parsed.value;
  }

  private line(offset: number): { readonly value: string; readonly offset: number } | undefined {
    const end = this.buffer.indexOf("\r\n", offset);
    if (end < 0) return undefined;
    return {
      value: this.buffer.subarray(offset, end).toString("utf8"),
      offset: end + 2,
    };
  }

  private read(offset: number): { readonly value: RedisValue; readonly offset: number } | undefined {
    if (offset >= this.buffer.length) return undefined;
    const type = String.fromCharCode(this.buffer[offset]);
    const header = this.line(offset + 1);
    if (!header) return undefined;
    if (type === "+") return { value: header.value, offset: header.offset };
    if (type === "-") throw new Error(`Redis error: ${header.value}`);
    if (type === ":") return { value: Number(header.value), offset: header.offset };
    if (type === "$" || type === "=") {
      const length = Number(header.value);
      if (length === -1) return { value: null, offset: header.offset };
      const end = header.offset + length;
      if (this.buffer.length < end + 2) return undefined;
      return {
        value: this.buffer.subarray(header.offset, end).toString("utf8"),
        offset: end + 2,
      };
    }
    if (type === "*") {
      const length = Number(header.value);
      if (length === -1) return { value: null, offset: header.offset };
      const values: RedisValue[] = [];
      let cursor = header.offset;
      for (let index = 0; index < length; index += 1) {
        const item = this.read(cursor);
        if (!item) return undefined;
        values.push(item.value);
        cursor = item.offset;
      }
      return { value: values, offset: cursor };
    }
    throw new Error(`Unsupported Redis response type ${type}`);
  }
}

interface PendingCommand {
  readonly resolve: (value: RedisValue) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

@Injectable()
export class RedisRespClient implements OnModuleDestroy {
  private socket?: Socket | TLSSocket;
  private connectPromise?: Promise<void>;
  private readonly parser = new RespParser();
  private readonly pending: PendingCommand[] = [];

  async command(...parts: readonly (string | number)[]): Promise<RedisValue> {
    await this.connect();
    if (!this.socket) throw new ServiceUnavailableException("Redis connection is unavailable");
    return new Promise<RedisValue>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.pending.findIndex((item) => item.timer === timer);
        if (index >= 0) this.pending.splice(index, 1);
        reject(new ServiceUnavailableException("Redis command timed out"));
        this.close();
      }, Number(process.env.REDIS_COMMAND_TIMEOUT_MS ?? 2_000));
      this.pending.push({ resolve, reject, timer });
      this.socket!.write(encodeCommand(parts));
    });
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.command("PING")) === "PONG";
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.close();
  }

  private async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.open().finally(() => {
      this.connectPromise = undefined;
    });
    return this.connectPromise;
  }

  private async open(): Promise<void> {
    const raw = process.env.REDIS_URL?.trim();
    if (!raw) throw new ServiceUnavailableException("REDIS_URL is not configured");
    const url = new URL(raw);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
      throw new ServiceUnavailableException("REDIS_URL must use redis or rediss");
    }
    const port = Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379));
    const socket = url.protocol === "rediss:"
      ? createTlsConnection({ host: url.hostname, port, servername: url.hostname })
      : createTcpConnection({ host: url.hostname, port });
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on("data", (chunk: Buffer) => this.onData(chunk));
    socket.on("error", (error) => this.fail(error));
    socket.on("close", () => this.fail(new Error("Redis connection closed")));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Redis connection timed out")), 3_000);
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    if (url.password) {
      const auth = url.username
        ? await this.command("AUTH", decodeURIComponent(url.username), decodeURIComponent(url.password))
        : await this.command("AUTH", decodeURIComponent(url.password));
      if (auth !== "OK") throw new Error("Redis authentication failed");
    }
    const database = Number(url.pathname.slice(1) || 0);
    if (database > 0) {
      const selected = await this.command("SELECT", database);
      if (selected !== "OK") throw new Error("Redis database selection failed");
    }
  }

  private onData(chunk: Buffer): void {
    this.parser.append(chunk);
    while (this.pending.length > 0) {
      let value: RedisValue | undefined;
      try {
        value = this.parser.parse();
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error("Redis response failed"));
        return;
      }
      if (value === undefined) return;
      const command = this.pending.shift()!;
      clearTimeout(command.timer);
      command.resolve(value);
    }
  }

  private fail(error: Error): void {
    const pending = this.pending.splice(0);
    for (const command of pending) {
      clearTimeout(command.timer);
      command.reject(error);
    }
    if (this.socket && !this.socket.destroyed) this.socket.destroy();
    this.socket = undefined;
  }

  private close(): void {
    this.fail(new Error("Redis client closed"));
  }
}
