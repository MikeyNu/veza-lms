import assert from "node:assert/strict";
import test from "node:test";
import { LearnerSubmissionService } from "../../dist/modules/academic-evidence/application/learner-submission.service.js";

const ids = {
  tenant: "11111111-1111-4111-8111-111111111111",
  actor: "22222222-2222-4222-8222-222222222222",
  membership: "33333333-3333-4333-8333-333333333333",
  institution: "44444444-4444-4444-8444-444444444444",
  learner: "55555555-5555-4555-8555-555555555555",
  assignment: "66666666-6666-4666-8666-666666666666",
  enrolment: "77777777-7777-4777-8777-777777777777",
  group: "88888888-8888-4888-8888-888888888888",
  attempt: "99999999-9999-4999-8999-999999999999",
};

const context = {
  tenantId: ids.tenant,
  actorId: ids.actor,
  membershipId: ids.membership,
  correlationId: "qe-assignment-session",
};

function createHarness(options = {}) {
  const auditWrites = [];
  const outboxWrites = [];
  const inserts = [];
  const updates = [];
  const assignment = {
    id: ids.assignment,
    institution_id: ids.institution,
    learner_person_id: ids.learner,
    due_at: options.dueAt ?? null,
    max_attempts: options.maxAttempts ?? 1,
    group_mode: options.groupMode ?? "individual",
  };
  const attempt = {
    id: ids.attempt,
    institution_id: ids.institution,
    assignment_id: ids.assignment,
    enrolment_id: ids.enrolment,
    learner_person_id: ids.learner,
    attempt_number: options.attemptNumber ?? 1,
    status: options.attemptStatus ?? "uploading",
    due_at: options.dueAt ?? null,
  };

  const client = {
    async query(sql, params = []) {
      if (sql.includes("app.require_owned_enrolment")) {
        return options.owned === false
          ? { rows: [], rowCount: 0 }
          : { rows: [{ learner_person_id: ids.learner }], rowCount: 1 };
      }
      if (sql.includes("FROM assignments a") && sql.includes("JOIN enrolments e")) {
        return options.assignmentFound === false
          ? { rows: [], rowCount: 0 }
          : { rows: [assignment], rowCount: 1 };
      }
      if (sql.includes("FROM assignment_groups g")) {
        return { rows: options.groupMember === false ? [] : [{ exists: 1 }], rowCount: options.groupMember === false ? 0 : 1 };
      }
      if (sql.includes("FROM assignment_accommodations")) {
        return { rows: [{ extra_attempts: options.extraAttempts ?? 0 }], rowCount: 1 };
      }
      if (sql.includes("count(*)::text count FROM submission_attempts")) {
        return { rows: [{ count: String(options.existingAttempts ?? 0) }], rowCount: 1 };
      }
      if (sql.includes("app.require_owned_submission_attempt")) return { rows: [{ ok: true }], rowCount: 1 };
      if (sql.includes("status IN ('submitted','accepted','withdrawn')")) {
        return { rows: options.supersededEligible === false ? [] : [{ exists: 1 }], rowCount: options.supersededEligible === false ? 0 : 1 };
      }
      if (sql.includes("INSERT INTO submission_attempts")) {
        inserts.push({ sql, params });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("FROM submission_attempts s") && sql.includes("JOIN assignments a")) {
        return options.attemptFound === false
          ? { rows: [], rowCount: 0 }
          : { rows: [attempt], rowCount: 1 };
      }
      if (sql.includes("FROM submission_files") && sql.includes("scan_status<>'clean'")) {
        return { rows: options.incompleteFiles ? [{ exists: 1 }] : [], rowCount: options.incompleteFiles ? 1 : 0 };
      }
      if (sql.includes("UPDATE submission_attempts SET status='submitted'")) {
        updates.push({ sql, params });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL in assignment session harness: ${sql}`);
    },
  };

  const database = {
    async withTenantTransaction(tenantId, operation) {
      assert.equal(tenantId, ids.tenant);
      return operation(client);
    },
  };
  const tenantContext = { require: () => context };
  const audit = { async append(_client, value) { auditWrites.push(value); } };
  const outbox = { async append(_client, value) { outboxWrites.push(value); } };

  return {
    service: new LearnerSubmissionService(database, tenantContext, audit, outbox),
    auditWrites,
    outboxWrites,
    inserts,
    updates,
  };
}

test("owned learner can start an individual assignment session with evidence", async () => {
  const harness = createHarness();
  const result = await harness.service.startSubmission({
    assignmentId: ids.assignment,
    enrolmentId: ids.enrolment,
  });

  assert.equal(result.status, "draft");
  assert.equal(result.attemptNumber, 1);
  assert.equal(result.assignmentGroupId, null);
  assert.equal(harness.inserts.length, 1);
  assert.equal(harness.auditWrites.length, 1);
  assert.equal(harness.outboxWrites.length, 1);
  assert.equal(harness.auditWrites[0].eventType, "assessment.submission.started");
  assert.equal(harness.outboxWrites[0].eventName, "assessment.submission.started");
});

test("assignment session rejects an enrolment not owned by the authenticated learner", async () => {
  const harness = createHarness({ owned: false });
  await assert.rejects(
    harness.service.startSubmission({ assignmentId: ids.assignment, enrolmentId: ids.enrolment }),
    /learner identity is not linked/i,
  );
  assert.equal(harness.auditWrites.length, 0);
  assert.equal(harness.outboxWrites.length, 0);
});

test("group assignment requires current membership of the selected assignment group", async () => {
  const missingGroup = createHarness({ groupMode: "group" });
  await assert.rejects(
    missingGroup.service.startSubmission({ assignmentId: ids.assignment, enrolmentId: ids.enrolment }),
    /require an assignment group/i,
  );

  const staleMembership = createHarness({ groupMode: "group", groupMember: false });
  await assert.rejects(
    staleMembership.service.startSubmission({
      assignmentId: ids.assignment,
      enrolmentId: ids.enrolment,
      assignmentGroupId: ids.group,
    }),
    /not a current member/i,
  );
});

test("assignment session enforces the effective attempt allowance including accommodation", async () => {
  const exhausted = createHarness({ maxAttempts: 1, existingAttempts: 1 });
  await assert.rejects(
    exhausted.service.startSubmission({ assignmentId: ids.assignment, enrolmentId: ids.enrolment }),
    /attempt allowance has been exhausted/i,
  );

  const accommodated = createHarness({ maxAttempts: 1, existingAttempts: 1, extraAttempts: 1 });
  const result = await accommodated.service.startSubmission({ assignmentId: ids.assignment, enrolmentId: ids.enrolment });
  assert.equal(result.attemptNumber, 2);
});

test("finalisation rejects incomplete or unscanned files without evidence writes", async () => {
  const harness = createHarness({ incompleteFiles: true });
  await assert.rejects(
    harness.service.finalizeSubmission(ids.attempt, { contentSnapshot: { answers: [{ item: 1, value: "A" }] } }),
    /fully uploaded and pass malware scanning/i,
  );
  assert.equal(harness.updates.length, 0);
  assert.equal(harness.auditWrites.length, 0);
  assert.equal(harness.outboxWrites.length, 0);
});

test("finalisation creates an immutable receipt checksum and matching evidence", async () => {
  const harness = createHarness({ dueAt: "2000-01-01T00:00:00.000Z" });
  const contentSnapshot = { answers: [{ item: 1, value: "A" }], declarationAccepted: true };
  const result = await harness.service.finalizeSubmission(ids.attempt, { contentSnapshot });

  assert.match(result.receiptNumber, /^VZ-\d{4}-[A-F0-9]{8}$/);
  assert.match(result.receiptChecksum, /^[a-f0-9]{64}$/);
  assert.equal(result.isLate, true);
  assert.equal(harness.updates.length, 1);
  assert.deepEqual(harness.updates[0].params[4], contentSnapshot);
  assert.equal(harness.updates[0].params[3], result.receiptChecksum);
  assert.equal(harness.auditWrites[0].eventType, "assessment.submission.finalised");
  assert.equal(harness.outboxWrites[0].eventName, "assessment.submission.finalised");
  assert.equal(harness.auditWrites[0].afterState.receiptChecksum, result.receiptChecksum);
});
