import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("studio operations validate every identifier before building a route", async () => {
  const client = await source("../src/server/learning-platform-api.ts");
  for (const field of [
    ["lessonId", "Lesson"],
    ["assetId", "Asset"],
    ["commentId", "Comment"],
    ["reviewId", "Review"],
    ["courseSpaceId", "Course space"],
  ]) {
    assert.equal(
      client.includes(`inputUuid(body, "${field[0]}", "${field[1]}")`),
      true,
      `Studio route does not validate ${field[0]}`,
    );
  }
});

test("academic operation routes cannot contain missing or malformed identifiers", async () => {
  const client = await source("../src/server/learning-platform-api.ts");
  assert.match(client, /function inputUuid/);
  assert.match(client, /function optionalInputUuid/);
  const academicMutations = client.slice(client.indexOf("export function mutateAcademic"));
  assert.doesNotMatch(academicMutations, /institutions\/\$\{institutionId\}/);
  assert.doesNotMatch(client, /String\(body\.(?:assignmentId|attemptId|fileId|markId)\)/);
  assert.match(client, /optionalInputUuid\(body, "institutionId", "Institution"\)/);
  assert.match(client, /const path = target\.path\(input\)/);
});
