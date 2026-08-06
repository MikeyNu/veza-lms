import assert from "node:assert/strict";
import { createServer } from "node:http";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const ingestPort = Number(process.env.UPLOAD_INGEST_PORT ?? 4900);
const sessionId = "qe-upload-session-0001";
const objectKey = "studio/qe/reconnect.bin";
const chunks = [Buffer.from("veza-upload-part-one"), Buffer.from("veza-upload-part-two")];
const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
let expectedOffset = 0;
let failNext = true;

const ingest = createServer((request, response) => {
  if (request.method !== "PATCH" || request.url !== "/ingest") {
    response.statusCode = 404;
    response.end();
    return;
  }
  if (request.headers.authorization !== "Bearer qe-ingest-token") {
    response.statusCode = 401;
    response.end();
    return;
  }
  if (failNext) {
    failNext = false;
    response.statusCode = 503;
    response.end();
    return;
  }
  const offset = Number(request.headers["x-upload-offset"]);
  assert.equal(offset, expectedOffset, "reconnected upload must resume from the last acknowledged offset");
  const parts = [];
  request.on("data", (part) => parts.push(part));
  request.on("end", () => {
    const body = Buffer.concat(parts);
    expectedOffset += body.byteLength;
    response.statusCode = 204;
    response.setHeader("x-upload-offset", String(expectedOffset));
    response.end();
  });
});

await new Promise((resolve) => ingest.listen(ingestPort, "127.0.0.1", resolve));

async function send(offset, chunk) {
  return fetch(`${baseUrl}/api/studio-upload`, {
    method: "PATCH",
    headers: {
      origin: baseUrl,
      "content-type": "application/octet-stream",
      "content-length": String(chunk.byteLength),
      "x-upload-session-id": sessionId,
      "x-object-key": objectKey,
      "x-upload-offset": String(offset),
      "x-upload-total": String(total),
    },
    body: chunk,
  });
}

try {
  const interrupted = await send(0, chunks[0]);
  assert.equal(interrupted.status, 502);
  assert.equal(expectedOffset, 0, "a failed ingest attempt must not advance the server offset");

  const resumed = await send(0, chunks[0]);
  assert.equal(resumed.status, 200);
  assert.deepEqual(await resumed.json(), { uploadOffset: chunks[0].byteLength, complete: false });

  const completed = await send(chunks[0].byteLength, chunks[1]);
  assert.equal(completed.status, 200);
  assert.deepEqual(await completed.json(), { uploadOffset: total, complete: true });
  assert.equal(expectedOffset, total);
  process.stdout.write("Studio upload reconnect behaviour passed.\n");
} finally {
  await new Promise((resolve, reject) => ingest.close((error) => error ? reject(error) : resolve()));
}
