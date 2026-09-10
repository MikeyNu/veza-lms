import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("learner calendar is principal scoped, enrolment scoped and range bounded", async () => {
  const [controller, service] = await Promise.all([
    source("../src/modules/learner-course/http/learner-calendar.controller.ts"),
    source("../src/modules/learner-course/application/learner-calendar.service.ts"),
  ]);

  assert.match(controller, /AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard/);
  assert.match(controller, /permissions\.learnerCourseRead/);
  assert.match(service, /person\.linked_user_id=\$1/);
  assert.match(service, /enrolment\.learner_person_id=\$1/);
  assert.match(service, /slot\.class_section_id IS NULL OR enrolment\.class_section_id=slot\.class_section_id/);
  assert.match(service, /enrolment\.effective_until IS NULL/);
  assert.match(service, /run\.lifecycle IN \('scheduled','open','in_progress'\)/);
  assert.match(service, /slot\.starts_at < \$3 AND slot\.ends_at > \$2/);
  assert.match(service, /Calendar range cannot exceed 31 days/);
  assert.match(service, /maximumSlots \+ 1/);
  assert.match(service, /too many sessions; request a shorter window/);
});

test("institution timetable read requires scoped catalogue permission and bounded range", async () => {
  const [controller, service] = await Promise.all([
    source("../src/modules/catalogue/http/delivery-timetable-query.controller.ts"),
    source("../src/modules/catalogue/application/delivery-timetable-query.service.ts"),
  ]);

  assert.match(controller, /permissions\.catalogueRead/);
  assert.match(controller, /buildInstitutionResource\(institutionId\)/);
  assert.match(service, /withTenantTransaction\(context\.tenantId/);
  assert.match(service, /SELECT id FROM institutions WHERE id=\$1/);
  assert.match(service, /slot\.institution_id=\$1/);
  assert.match(service, /run\.lifecycle IN \('scheduled','open','in_progress'\)/);
  assert.match(service, /slot\.starts_at < \$3 AND slot\.ends_at > \$2/);
  assert.match(service, /Timetable range cannot exceed 31 days/);
  assert.match(service, /maximumSlots \+ 1/);
});
