import { isSameOriginRequest } from "@veza/oidc-bff";
import { NextResponse, type NextRequest } from "next/server";

const noStore = { "cache-control": "no-store" };
const maximumChunkBytes = 8 * 1024 * 1024;

export async function PATCH(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json(
      { message: "Cross-origin Studio uploads are not allowed." },
      { status: 403, headers: noStore },
    );
  }
  const ingestUrl = process.env.VEZA_OBJECT_STORAGE_INGEST_URL?.trim();
  const ingestToken = process.env.VEZA_OBJECT_STORAGE_INGEST_TOKEN?.trim();
  if (!ingestUrl || !ingestToken) {
    return NextResponse.json(
      { message: "Studio object-storage ingest is not configured." },
      { status: 503, headers: noStore },
    );
  }
  const sessionId = request.headers.get("x-upload-session-id") ?? "";
  const objectKey = request.headers.get("x-object-key") ?? "";
  const offset = Number(request.headers.get("x-upload-offset") ?? "-1");
  const total = Number(request.headers.get("x-upload-total") ?? "-1");
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(sessionId)) {
    return NextResponse.json({ message: "Upload session is invalid." }, { status: 400, headers: noStore });
  }
  if (!/^[A-Za-z0-9/_=.()+ -]{3,1024}$/.test(objectKey) || objectKey.includes("..")) {
    return NextResponse.json({ message: "Object key is invalid." }, { status: 400, headers: noStore });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(total) ||
    offset < 0 ||
    total < 1 ||
    offset > total ||
    !Number.isSafeInteger(declaredLength) ||
    declaredLength < 1 ||
    declaredLength > maximumChunkBytes
  ) {
    return NextResponse.json({ message: "Upload range is invalid." }, { status: 400, headers: noStore });
  }
  const chunk = await request.arrayBuffer();
  if (chunk.byteLength !== declaredLength || offset + chunk.byteLength > total) {
    return NextResponse.json({ message: "Upload chunk length is inconsistent." }, { status: 400, headers: noStore });
  }
  const response = await fetch(ingestUrl, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${ingestToken}`,
      "content-type": "application/octet-stream",
      "content-length": String(chunk.byteLength),
      "x-upload-session-id": sessionId,
      "x-object-key": objectKey,
      "x-upload-offset": String(offset),
      "x-upload-total": String(total),
    },
    body: chunk,
    signal: AbortSignal.timeout(30_000),
  });
  const acknowledged = Number(response.headers.get("x-upload-offset") ?? offset + chunk.byteLength);
  if (!response.ok || !Number.isSafeInteger(acknowledged) || acknowledged <= offset || acknowledged > total) {
    return NextResponse.json(
      { message: "Object-storage ingest did not acknowledge the Studio upload." },
      { status: 502, headers: noStore },
    );
  }
  return NextResponse.json(
    { uploadOffset: acknowledged, complete: acknowledged === total },
    { status: 200, headers: noStore },
  );
}
