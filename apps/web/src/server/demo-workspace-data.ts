import "server-only";

import {
  demoInstitutionId,
  demoLearnerPersonId,
  demoNow,
  demoTenantId,
} from "./demo-mode";

const id = {
  learner2: "00000000-0000-4000-8000-000000000103",
  guardian: "00000000-0000-4000-8000-000000000104",
  staff: "00000000-0000-4000-8000-000000000102",
  run: "00000000-0000-4000-8000-000000001201",
  enrolment: "00000000-0000-4000-8000-000000001101",
  enrolment2: "00000000-0000-4000-8000-000000001102",
  period: "00000000-0000-4000-8000-000000004201",
  programme: "00000000-0000-4000-8000-000000005001",
  blueprint: "00000000-0000-4000-8000-000000005002",
  courseSpace: "00000000-0000-4000-8000-000000006001",
  module: "00000000-0000-4000-8000-000000006101",
  lesson: "00000000-0000-4000-8000-000000006201",
  publication: "00000000-0000-4000-8000-000000006401",
  assignment: "00000000-0000-4000-8000-000000007201",
} as const;

function receipt(path: string) {
  return {
    ok: true,
    demo: true,
    persisted: false,
    path,
    id: "00000000-0000-4000-8000-000000009998",
    operationId: "00000000-0000-4000-8000-000000009999",
    status: "accepted",
    generatedAt: demoNow,
  };
}

function peopleDirectory() {
  return {
    items: [
      {
        id: demoLearnerPersonId,
        version: 4,
        displayName: "Naledi Mokoena",
        givenName: "Naledi",
        familyName: "Mokoena",
        preferredName: "Naledi",
        primaryEmail: "naledi.mokoena@demo.veza.local",
        status: "active",
        learnerStatus: "active",
        institutionalIdentifiers: ["AKH-L-2026-0142"],
        updatedAt: demoNow,
      },
      {
        id: id.learner2,
        version: 2,
        displayName: "Thabo Dlamini",
        givenName: "Thabo",
        familyName: "Dlamini",
        primaryEmail: "thabo.dlamini@demo.veza.local",
        status: "active",
        learnerStatus: "active",
        institutionalIdentifiers: ["AKH-L-2026-0168"],
        updatedAt: "2026-08-06T12:25:00.000Z",
      },
      {
        id: id.staff,
        version: 6,
        displayName: "Lerato Khumalo",
        givenName: "Lerato",
        familyName: "Khumalo",
        primaryEmail: "lerato.khumalo@demo.veza.local",
        status: "active",
        staffStatus: "active",
        institutionalIdentifiers: ["AKH-S-0047"],
        updatedAt: "2026-08-05T08:45:00.000Z",
      },
    ],
    page: { limit: 30 },
  };
}

function rawPerson(personId: string) {
  const staff = personId === id.staff;
  const second = personId === id.learner2;
  const given = staff ? "Lerato" : second ? "Thabo" : "Naledi";
  const family = staff ? "Khumalo" : second ? "Dlamini" : "Mokoena";
  return {
    id: personId,
    version: staff ? 6 : 4,
    legal_given_names: given,
    legal_family_name: family,
    preferred_name: given,
    date_of_birth: staff ? undefined : "2004-06-17",
    locale: "en-ZA",
    status: "active",
    updated_at: demoNow,
    contacts: [
      {
        id: "00000000-0000-4000-8000-000000007001",
        version: 1,
        kind: "email",
        value: `${given.toLowerCase()}.${family.toLowerCase()}@demo.veza.local`,
        label: "Primary",
        is_primary: true,
        is_verified: true,
        verification_recorded_at: "2026-02-10T09:00:00.000Z",
        valid_from: "2026-01-15T00:00:00.000Z",
      },
    ],
    addresses: [
      {
        id: "00000000-0000-4000-8000-000000007011",
        version: 1,
        address_type: "residential",
        address: { city: "Johannesburg", province: "Gauteng", country: "ZA" },
        is_primary: true,
        valid_from: "2026-01-15T00:00:00.000Z",
      },
    ],
    identifiers: [
      {
        id: "00000000-0000-4000-8000-000000007021",
        version: 1,
        institution_id: demoInstitutionId,
        identifier_type: staff ? "employee-number" : "student-number",
        identifier_value: staff ? "AKH-S-0047" : "AKH-L-2026-0142",
        issuing_authority: "Akha Academy",
        valid_from: "2026-01-15T00:00:00.000Z",
      },
    ],
    organisational_assignments: staff
      ? [{
          id: "00000000-0000-4000-8000-000000007031",
          version: 1,
          institution_id: demoInstitutionId,
          organisational_unit_id: "00000000-0000-4000-8000-000000004301",
          assignment_type: "teaching",
          title: "Senior facilitator",
          is_primary: true,
          valid_from: "2025-01-15T00:00:00.000Z",
        }]
      : [],
    staff_engagements: staff
      ? [{
          id: "00000000-0000-4000-8000-000000007041",
          version: 2,
          institution_id: demoInstitutionId,
          organisational_unit_id: "00000000-0000-4000-8000-000000004301",
          engagement_type: "employee",
          employee_number: "AKH-S-0047",
          title: "Senior facilitator",
          status: "active",
          started_on: "2025-01-15",
        }]
      : [],
    consents: [],
    disclosure_restrictions: [],
    identity_link_requests: [],
    data_subject_requests: [],
    learner: staff ? undefined : {
      person_id: personId,
      institution_id: demoInstitutionId,
      status: "active",
      admission_date: "2026-01-15",
    },
    staff: staff ? {
      person_id: personId,
      institution_id: demoInstitutionId,
      status: "active",
      employee_number: "AKH-S-0047",
      engagement_type: "employee",
      started_on: "2025-01-15",
    } : undefined,
    relationships: personId === demoLearnerPersonId
      ? [{
          id: "00000000-0000-4000-8000-000000007051",
          version: 2,
          institution_id: demoInstitutionId,
          related_person_id: id.guardian,
          relationship_type: "guardian",
          verified_at: "2026-02-02T08:00:00.000Z",
          valid_from: "2026-01-15T00:00:00.000Z",
          authority: { canReceiveCommunications: true, canAccessRecords: true },
        }]
      : [],
  };
}

function peopleReferences() {
  return {
    institutionId: demoInstitutionId,
    organisationalUnits: [
      { id: "00000000-0000-4000-8000-000000004301", code: "DIGITAL", displayName: "School of Digital Learning", unitType: "school" },
      { id: "00000000-0000-4000-8000-000000004302", code: "STUDENT", displayName: "Student Success", unitType: "centre" },
    ],
    linkableIdentities: [
      { userId: "00000000-0000-4000-8000-000000008001", displayName: "Naledi Mokoena", email: "naledi.mokoena@demo.veza.local", roles: ["learner"] },
      { userId: "00000000-0000-4000-8000-000000008002", displayName: "Lerato Khumalo", email: "lerato.khumalo@demo.veza.local", roles: ["instructor"] },
    ],
  };
}

function catalogue() {
  return {
    institutionId: demoInstitutionId,
    programmes: [{
      id: id.programme,
      programmeId: "00000000-0000-4000-8000-000000005101",
      institutionId: demoInstitutionId,
      code: "DLP-01",
      title: "Digital Learning Practice",
      programmeType: "short-course",
      versionNumber: 3,
      lifecycle: "approved",
      creditValue: 12,
      notionalHours: 120,
      durationValue: 12,
      durationUnit: "weeks",
      effectiveFrom: "2026-01-01",
      approvedAt: "2025-12-12T09:30:00.000Z",
      courseCount: 1,
      version: 5,
    }],
    blueprints: [{
      id: id.blueprint,
      courseDefinitionId: "00000000-0000-4000-8000-000000005102",
      institutionId: demoInstitutionId,
      code: "DL-101",
      title: "Data Literacy Foundations",
      definitionType: "course",
      subjectArea: "Digital literacy",
      versionNumber: 4,
      lifecycle: "approved",
      creditValue: 12,
      notionalHours: 120,
      deliveryModes: ["blended", "online"],
      effectiveFrom: "2026-01-01",
      approvedAt: "2025-12-12T09:45:00.000Z",
      outcomeCount: 2,
      requisiteCount: 0,
      version: 6,
    }],
    outcomes: [
      { id: "00000000-0000-4000-8000-000000005201", institutionId: demoInstitutionId, code: "DL-O1", title: "Interpret structured data in context", outcomeType: "skill", levelCode: "NQF5", status: "active", version: 2 },
      { id: "00000000-0000-4000-8000-000000005202", institutionId: demoInstitutionId, code: "DL-O2", title: "Communicate evidence-based findings", outcomeType: "competency", levelCode: "NQF5", status: "active", version: 1 },
    ],
    runs: [{
      id: id.run,
      institutionId: demoInstitutionId,
      academicPeriodId: id.period,
      blueprintVersionId: id.blueprint,
      code: "DL101-S2-26",
      title: "Data Literacy Foundations",
      deliveryMode: "blended",
      startsOn: "2026-07-20",
      endsOn: "2026-10-09",
      capacity: 48,
      lifecycle: "in_progress",
      classCount: 2,
      activeEnrolmentCount: 36,
      version: 8,
    }],
    enrolments: [
      { id: id.enrolment, institutionId: demoInstitutionId, learnerPersonId: demoLearnerPersonId, learnerDisplayName: "Naledi Mokoena", courseRunId: id.run, courseRunTitle: "Data Literacy Foundations", classSectionId: "00000000-0000-4000-8000-000000005301", cohortId: "00000000-0000-4000-8000-000000005401", status: "active", enrolledOn: "2026-06-20", effectiveFrom: "2026-07-20", version: 3 },
      { id: id.enrolment2, institutionId: demoInstitutionId, learnerPersonId: id.learner2, learnerDisplayName: "Thabo Dlamini", courseRunId: id.run, courseRunTitle: "Data Literacy Foundations", classSectionId: "00000000-0000-4000-8000-000000005301", cohortId: "00000000-0000-4000-8000-000000005401", status: "active", enrolledOn: "2026-06-21", effectiveFrom: "2026-07-20", version: 2 },
    ],
  };
}

function catalogueReferences() {
  return {
    academicPeriods: [{ id: id.period, code: "2026-S2", title: "Semester 2 2026", startsOn: "2026-07-13", endsOn: "2026-11-20" }],
    eligibleLearners: [
      { id: demoLearnerPersonId, displayName: "Naledi Mokoena", learnerStatus: "active" },
      { id: id.learner2, displayName: "Thabo Dlamini", learnerStatus: "active" },
    ],
    eligibleStaff: [{ id: id.staff, displayName: "Lerato Khumalo", staffStatus: "active", employeeNumber: "AKH-S-0047" }],
    cohorts: [{ id: "00000000-0000-4000-8000-000000005401", code: "DL26-B", title: "Digital Learning 2026 B", status: "active" }],
    classes: [{ id: "00000000-0000-4000-8000-000000005301", courseRunId: id.run, cohortId: "00000000-0000-4000-8000-000000005401", code: "DL101-A", title: "Data Literacy A", status: "active", version: 4 }],
  };
}

function learnerHome() {
  return {
    learnerPersonId: demoLearnerPersonId,
    generatedAt: demoNow,
    today: [
      { id: id.lesson, kind: "lesson", courseRunId: id.run, title: "Reading a dataset critically", courseTitle: "Data Literacy Foundations", href: `/courses/${id.enrolment}`, priority: 1 },
      { id: id.assignment, kind: "assignment", courseRunId: id.run, title: "Lab 2: Evidence and interpretation", courseTitle: "Data Literacy Foundations", dueAt: "2026-08-10T15:00:00.000Z", href: "/assessments", priority: 2 },
    ],
    courses: [{
      enrolmentId: id.enrolment,
      courseRunId: id.run,
      courseTitle: "Data Literacy Foundations",
      deliveryMode: "blended",
      nextLessonId: id.lesson,
      nextLessonTitle: "Reading a dataset critically",
      progressPercent: 62,
      completedLessons: 5,
      totalLessons: 8,
      startsOn: "2026-07-20",
      endsOn: "2026-10-09",
    }],
  };
}

function courseRoom(enrolmentId: string) {
  return {
    enrolmentId,
    courseRunId: id.run,
    courseTitle: "Data Literacy Foundations",
    publicationSnapshotId: id.publication,
    publicationChecksum: "demo-dl101-publication-v4",
    progressPercent: 62,
    completedLessons: 5,
    totalLessons: 8,
    modules: [{
      id: id.module,
      title: "Working with evidence",
      description: "Build practical habits for reading and communicating data.",
      sequenceNumber: 2,
      completionPercent: 50,
      lessons: [{
        id: id.lesson,
        moduleId: id.module,
        title: "Reading a dataset critically",
        summary: "Separate observation, interpretation and claim.",
        sequenceNumber: 1,
        estimatedMinutes: 25,
        blocks: [
          { id: "00000000-0000-4000-8000-000000006301", type: "heading", data: { text: "Evidence before conclusions", level: 2 } },
          { id: "00000000-0000-4000-8000-000000006302", type: "paragraph", data: { text: "Review the source, sample and measurement method before interpreting a pattern." } },
        ],
        completionRule: { type: "view" },
        completed: false,
        bookmarked: true,
      }],
    }],
    announcements: [{ id: "00000000-0000-4000-8000-000000006501", title: "Lab support session", body: "A live support session is scheduled for Friday at 14:00.", publishedAt: "2026-08-06T10:00:00.000Z" }],
    timetable: [{ id: "00000000-0000-4000-8000-000000006511", title: "Data Literacy live class", startsAt: "2026-08-11T08:00:00.000Z", endsAt: "2026-08-11T09:30:00.000Z", location: "Room 2A / Teams" }],
    discussions: [{ id: "00000000-0000-4000-8000-000000006521", title: "What makes a source trustworthy?", replyCount: 8, updatedAt: "2026-08-07T08:20:00.000Z" }],
    offlineAvailable: true,
    dataFreshness: demoNow,
  };
}

function studio() {
  return {
    institutionId: demoInstitutionId,
    spaces: [{ id: id.courseSpace, institutionId: demoInstitutionId, blueprintVersionId: id.blueprint, title: "Data Literacy Foundations", status: "published", moduleCount: 3, lessonCount: 8, currentPublicationId: id.publication, version: 9 }],
    modules: [{ id: id.module, courseSpaceId: id.courseSpace, title: "Working with evidence", description: "Practical data-reading habits.", sequenceNumber: 2, availabilityRule: {}, completionRule: { type: "all-lessons" }, status: "active", version: 3 }],
    lessons: [{ id: id.lesson, courseSpaceId: id.courseSpace, moduleId: id.module, title: "Reading a dataset critically", summary: "Separate observation, interpretation and claim.", sequenceNumber: 1, lessonType: "lesson", estimatedMinutes: 25, availabilityRule: {}, completionRule: { type: "view" }, status: "published", currentRevisionId: "00000000-0000-4000-8000-000000006311", version: 5 }],
  };
}

function studioLibrary() {
  return {
    institutionId: demoInstitutionId,
    reusableBlocks: [{ id: "00000000-0000-4000-8000-000000006601", name: "Source evaluation prompt", blockType: "callout", content: { title: "Check the source", text: "Who produced this evidence and why?" }, status: "active", version: 2, updatedAt: "2026-08-05T10:00:00.000Z" }],
    assets: [{ id: "00000000-0000-4000-8000-000000006701", courseSpaceId: id.courseSpace, assetKind: "document", objectKey: "demo/data-literacy/source-evaluation.pdf", originalFilename: "source-evaluation-guide.pdf", mediaType: "application/pdf", sizeBytes: 248320, checksumSha256: "demo-source-evaluation-checksum", malwareStatus: "clean", metadata: { pages: 4 }, status: "ready", version: 2, createdAt: "2026-07-30T09:00:00.000Z", updatedAt: "2026-08-02T12:00:00.000Z" }],
    publications: [{ id: id.publication, courseSpaceId: id.courseSpace, courseTitle: "Data Literacy Foundations", publicationNumber: 4, sourceReviewId: "00000000-0000-4000-8000-000000006801", checksumSha256: "demo-dl101-publication-v4", status: "current", publishedAt: "2026-08-04T11:30:00.000Z" }],
    importReports: [],
  };
}

function studioLesson(lessonId: string) {
  return {
    id: lessonId,
    courseSpaceId: id.courseSpace,
    moduleId: id.module,
    title: "Reading a dataset critically",
    summary: "Separate observation, interpretation and claim.",
    sequenceNumber: 1,
    lessonType: "lesson",
    estimatedMinutes: 25,
    availabilityRule: {},
    completionRule: { type: "view" },
    status: "published",
    currentRevisionId: "00000000-0000-4000-8000-000000006311",
    version: 5,
    revisions: [{ id: "00000000-0000-4000-8000-000000006311", lessonId, revisionNumber: 4, blocks: [{ id: "00000000-0000-4000-8000-000000006302", type: "paragraph", data: { text: "Review source, sample and method before interpreting a pattern." } }], checksumSha256: "demo-lesson-revision-v4", changeSummary: "Clarified the evidence checklist.", accessibilityReport: { passed: true, findings: [] }, linkReport: { passed: true, findings: [] }, readingMetrics: { words: 690, minutes: 4 }, createdBy: id.staff, createdAt: "2026-08-04T09:15:00.000Z" }],
    comments: [],
    reviews: [{ id: "00000000-0000-4000-8000-000000006801", revisionId: "00000000-0000-4000-8000-000000006311", status: "approved", requestedBy: id.staff, requestedAt: "2026-08-04T09:20:00.000Z", reviewedBy: id.staff, reviewedAt: "2026-08-04T10:15:00.000Z", decisionNotes: "Approved for publication.", version: 2 }],
  };
}

function academicEvidence() {
  return {
    institutionId: demoInstitutionId,
    assignments: [
      { id: id.assignment, institutionId: demoInstitutionId, courseRunId: id.run, courseRunTitle: "Data Literacy Foundations", title: "Lab 2: Evidence and interpretation", dueAt: "2026-08-10T15:00:00.000Z", status: "published", groupMode: "individual", maxAttempts: 2, allowedFormats: ["text", "file"], submissionCount: 31, version: 4 },
      { id: "00000000-0000-4000-8000-000000007202", institutionId: demoInstitutionId, courseRunId: id.run, courseRunTitle: "Data Literacy Foundations", title: "Final evidence brief", dueAt: "2026-09-28T15:00:00.000Z", status: "draft", groupMode: "group", maxAttempts: 1, allowedFormats: ["file", "url"], submissionCount: 0, version: 1 },
    ],
    submissions: [{ id: "00000000-0000-4000-8000-000000007211", assignmentId: id.assignment, assignmentTitle: "Lab 2: Evidence and interpretation", enrolmentId: id.enrolment, learnerPersonId: demoLearnerPersonId, learnerName: "Naledi Mokoena", attemptNumber: 1, status: "submitted", isLate: false, fileCount: 1, allFilesClean: true, receiptNumber: "AKH-2026-000184", submittedAt: "2026-08-07T08:40:00.000Z" }],
    gradebooks: [{ courseRunId: id.run, courseRunTitle: "Data Literacy Foundations", itemCount: 4, publishedResultCount: 68, draftResultCount: 4, formulaVersion: 3, passMark: 50 }],
    certificates: [{ id: "00000000-0000-4000-8000-000000007221", learnerPersonId: id.learner2, learnerName: "Thabo Dlamini", status: "issued", issuedAt: "2026-07-18T11:00:00.000Z", verificationCode: "AKH26DL1042", payload: { credentialTitle: "Digital Learning Practice" } }],
    exports: [{ id: "00000000-0000-4000-8000-000000007231", exportType: "gradebook", format: "csv", rowCount: 36, status: "ready", requestedAt: "2026-08-06T13:10:00.000Z" }],
    rubrics: [{ id: "00000000-0000-4000-8000-000000007241", title: "Evidence interpretation rubric", lifecycle: "approved", versionNumber: 2, criteriaCount: 4 }],
    assignmentGroups: [],
    certificateTemplates: [{ id: "00000000-0000-4000-8000-000000007261", title: "Short course completion certificate", status: "active" }],
    awardRules: [{ id: "00000000-0000-4000-8000-000000007271", title: "Complete programme with published passing result", status: "active" }],
  };
}

function gradebook() {
  return {
    courseRunId: id.run,
    categories: [{ id: "00000000-0000-4000-8000-000000007301", title: "Coursework", weight: 0.6 }],
    items: [{ id: "00000000-0000-4000-8000-000000007311", title: "Lab 2", maximumScore: 100, weight: 0.25 }],
    formula: { version: 3, type: "weighted-sum", passMark: 50 },
    results: [
      { id: "00000000-0000-4000-8000-000000007321", enrolmentId: id.enrolment, learnerName: "Naledi Mokoena", score: 78, percentage: 78, state: "published" },
      { id: "00000000-0000-4000-8000-000000007322", enrolmentId: id.enrolment2, learnerName: "Thabo Dlamini", score: 84, percentage: 84, state: "published" },
    ],
  };
}

function analytics() {
  const metric = (key: string, title: string, description: string, unit: string, value: number) => ({
    key,
    title,
    description,
    unit,
    value,
    measuredAt: demoNow,
    sourceMaxOccurredAt: "2026-08-07T09:55:00.000Z",
    freshnessSeconds: 300,
    drillthroughFilter: {},
  });
  return [
    metric("active-learners", "Active learners", "Learners with an active enrolment in the current period.", "learners", 428),
    metric("course-completion", "Course completion", "Completion rate across course runs ending this term.", "%", 81.4),
    metric("submission-on-time", "On-time submissions", "Submitted attempts received before their due time.", "%", 92.7),
    metric("intervention-open", "Open interventions", "Learners currently flagged for staff follow-up.", "learners", 17),
  ];
}

function terminology() {
  return [{
    id: "00000000-0000-4000-8000-000000007401",
    institutionId: demoInstitutionId,
    locale: "en-ZA",
    versionNumber: 2,
    lifecycle: "approved",
    title: "Akha Academy terminology",
    description: "Institution-wide learner and programme labels.",
    effectiveFrom: "2026-01-01",
    version: 4,
    entries: [
      { canonicalKey: "learner", singularLabel: "Learner", pluralLabel: "Learners" },
      { canonicalKey: "programme", singularLabel: "Programme", pluralLabel: "Programmes" },
      { canonicalKey: "course", singularLabel: "Course", pluralLabel: "Courses" },
    ],
    programmeHierarchy: [
      { levelOrder: 1, canonicalType: "programme", singularLabel: "Programme", pluralLabel: "Programmes", isRequired: true, minimumOccurrences: 1 },
      { levelOrder: 2, canonicalType: "course", singularLabel: "Course", pluralLabel: "Courses", isRequired: true, minimumOccurrences: 1 },
    ],
  }];
}

function resolvedTerminology() {
  const pair = (singular: string, plural: string) => ({ singular, plural });
  return {
    institutionId: demoInstitutionId,
    requestedLocale: "en-ZA",
    resolvedLocale: "en-ZA",
    terminologyVersionId: "00000000-0000-4000-8000-000000007401",
    effectiveAt: demoNow,
    labels: {
      learner: pair("Learner", "Learners"), staff: pair("Staff member", "Staff"), guardian: pair("Guardian", "Guardians"), sponsor: pair("Sponsor", "Sponsors"), programme: pair("Programme", "Programmes"), qualification: pair("Qualification", "Qualifications"), "learning-path": pair("Learning path", "Learning paths"), subject: pair("Subject", "Subjects"), module: pair("Module", "Modules"), course: pair("Course", "Courses"), grade: pair("Grade", "Grades"), year: pair("Year", "Years"), level: pair("Level", "Levels"), cohort: pair("Cohort", "Cohorts"), class: pair("Class", "Classes"), "academic-period": pair("Academic period", "Academic periods"), outcome: pair("Outcome", "Outcomes"), competency: pair("Competency", "Competencies"),
    },
    programmeHierarchy: [
      { levelOrder: 1, canonicalType: "programme", singularLabel: "Programme", pluralLabel: "Programmes", isRequired: true, minimumOccurrences: 1 },
      { levelOrder: 2, canonicalType: "course", singularLabel: "Course", pluralLabel: "Courses", isRequired: true, minimumOccurrences: 1 },
    ],
  };
}

function storage() {
  return {
    tenantId: demoTenantId,
    generatedAt: demoNow,
    storedBytes: 19_486_736_384,
    quota: { limitBytes: 53_687_091_200, warningPercent: 85, status: "healthy" },
    namespaces: [
      { id: "00000000-0000-4000-8000-000000007501", key: "learning-content", displayName: "Learning content", storedBytes: 12_884_901_888, assetCount: 318 },
      { id: "00000000-0000-4000-8000-000000007502", key: "submissions", displayName: "Learner submissions", storedBytes: 6_601_834_496, assetCount: 942 },
    ],
    policies: [{ id: "00000000-0000-4000-8000-000000007511", namespace_key: "learning-content", retention_days: 2555, status: "active" }],
    assets: [{ id: "00000000-0000-4000-8000-000000007521", namespace_key: "learning-content", original_filename: "source-evaluation-guide.pdf", media_type: "application/pdf", size_bytes: 248320, status: "ready", accessibility_status: "complete", created_at: "2026-07-30T09:00:00.000Z" }],
    processingJobs: [{ id: "00000000-0000-4000-8000-000000007531", job_type: "video-transcode", state: "completed", asset_id: "00000000-0000-4000-8000-000000007521", updated_at: "2026-08-06T11:15:00.000Z" }],
    monthlyUsage: [
      { month: "2026-07", stored_bytes: 17_612_845_056, egress_bytes: 4_885_102_592 },
      { month: "2026-08", stored_bytes: 19_486_736_384, egress_bytes: 1_248_702_464 },
    ],
    recordingConsents: [{ id: "00000000-0000-4000-8000-000000007541", person_id: demoLearnerPersonId, purpose: "live-session-recording", state: "granted", granted_at: "2026-07-18T08:00:00.000Z" }],
  };
}

function serviceAccounts() {
  return {
    items: [{
      id: "00000000-0000-4000-8000-000000007601",
      clientId: "veza_demo_sis_sync",
      displayName: "Student information sync",
      scopes: ["people:read", "catalogue:read", "enrolments:write"],
      allowedIpCidrs: ["196.25.0.0/16"],
      tokenTtlSeconds: 3600,
      status: "active",
      version: 3,
      lastUsedAt: "2026-08-07T09:42:00.000Z",
      createdAt: "2026-04-12T08:00:00.000Z",
      updatedAt: "2026-07-01T10:00:00.000Z",
      principal: { userId: "00000000-0000-4000-8000-000000007611", displayName: "SIS integration" },
      activeSecret: { prefix: "vza_demo_", createdAt: "2026-07-01T10:00:00.000Z" },
    }],
  };
}

function communications(recipient = false) {
  if (recipient) {
    return {
      generatedAt: demoNow,
      preferences: [{ id: "00000000-0000-4000-8000-000000007731", topic_key: "*", channel: "email", state: "enabled", digest_frequency: null, quiet_hours: { timezone: "Africa/Johannesburg", start: "21:00", end: "07:00" }, version: 1, updated_at: demoNow }],
      notifications: [{ id: "00000000-0000-4000-8000-000000007741", template_key: "learning.assignment-reminder", topic_key: "learning.assignments", policy: "optional", requested_channels: ["email", "push"], status: "completed", scheduled_at: "2026-08-07T08:00:00.000Z", created_at: "2026-08-07T08:00:00.000Z", completed_at: "2026-08-07T08:00:03.000Z", channel: "email", delivery_state: "delivered", content_snapshot: { subject: "Assignment due Monday", body: "Lab 2 is due Monday at 17:00." }, activity_at: "2026-08-07T08:00:03.000Z" }],
    };
  }
  return {
    tenantId: demoTenantId,
    generatedAt: demoNow,
    templates: [{ id: "00000000-0000-4000-8000-000000007701", display_name: "Assignment reminder", template_key: "learning.assignment-reminder", topic_key: "learning.assignments", policy: "optional", active_version_number: 2, status: "active" }],
    senders: [{ id: "00000000-0000-4000-8000-000000007711", sender_identity: "notifications@demo.veza.local", provider_key: "http-email", channel: "email", status: "active", verified_at: "2026-04-15T08:00:00.000Z" }],
    preferences: [],
    recentDeliveries: [{ id: "00000000-0000-4000-8000-000000007721", template_key: "learning.assignment-reminder", topic_key: "learning.assignments", channel: "email", provider_key: "http-email", state: "delivered", attempts: 1, updated_at: "2026-08-07T09:20:00.000Z" }],
    activeSuppressions: [],
  };
}

export class DemoWorkspaceFixtureError extends Error {
  constructor(readonly path: string) {
    super(`Demo data is not configured for ${path}`);
    this.name = "DemoWorkspaceFixtureError";
  }
}

export function resolveDemoWorkspaceRequest(path: string, init?: RequestInit): unknown {
  const method = (init?.method ?? "GET").toUpperCase();
  const pathname = new URL(path, "https://demo.veza.local").pathname;
  if (method !== "GET" && method !== "HEAD") return receipt(pathname);

  if (pathname === "/v1/people") return peopleDirectory();
  if (pathname === "/v1/people/duplicates") return {
    items: [{ id: "00000000-0000-4000-8000-000000007801", leftPerson: { id: demoLearnerPersonId, displayName: "Naledi Mokoena", version: 4 }, rightPerson: { id: id.learner2, displayName: "Thabo Dlamini", version: 2 }, matchScore: 0.73, reasons: ["shared mobile number"], status: "open", createdAt: "2026-08-06T07:30:00.000Z" }],
    page: { limit: 20 },
  };
  if (/^\/v1\/people\/institutions\/[0-9a-f-]{36}\/references$/i.test(pathname)) return peopleReferences();
  const personMatch = pathname.match(/^\/v1\/people\/([0-9a-f-]{36})$/i);
  if (personMatch) return rawPerson(personMatch[1] ?? demoLearnerPersonId);

  if (/^\/v1\/institutions\/[0-9a-f-]{36}\/catalogue\/references$/i.test(pathname)) return catalogueReferences();
  if (/^\/v1\/institutions\/[0-9a-f-]{36}\/catalogue$/i.test(pathname)) return catalogue();
  if (/^\/v1\/institutions\/[0-9a-f-]{36}\/terminology\/resolved$/i.test(pathname)) return resolvedTerminology();
  if (/^\/v1\/institutions\/[0-9a-f-]{36}\/terminology$/i.test(pathname)) return terminology();
  if (/^\/v1\/institutions\/[0-9a-f-]{36}\/studio\/library$/i.test(pathname)) return studioLibrary();
  const lessonMatch = pathname.match(/^\/v1\/institutions\/[0-9a-f-]{36}\/studio\/lessons\/([0-9a-f-]{36})$/i);
  if (lessonMatch) return studioLesson(lessonMatch[1] ?? id.lesson);
  if (/^\/v1\/institutions\/[0-9a-f-]{36}\/studio$/i.test(pathname)) return studio();

  if (pathname === "/v1/learner/home") return learnerHome();
  const roomMatch = pathname.match(/^\/v1\/learner\/enrolments\/([0-9a-f-]{36})\/course-room$/i);
  if (roomMatch) return courseRoom(roomMatch[1] ?? id.enrolment);
  if (pathname === "/v1/learner/assignments") return { learnerPersonId: demoLearnerPersonId, assignments: academicEvidence().assignments, generatedAt: demoNow };
  if (/^\/v1\/learner\/gradebook\/[0-9a-f-]{36}$/i.test(pathname)) return gradebook();

  if (/^\/v1\/institutions\/[0-9a-f-]{36}\/academic-evidence$/i.test(pathname)) return academicEvidence();
  if (/^\/v1\/academic-evidence\/gradebook\/[0-9a-f-]{36}(\/staff)?$/i.test(pathname)) return gradebook();
  if (pathname === "/v1/academic-evidence/analytics") return analytics();

  if (pathname === "/v1/storage/workspace") return storage();
  if (pathname === "/v1/storage/deletion-requests") return { items: [{ id: "00000000-0000-4000-8000-000000007901", asset_id: "00000000-0000-4000-8000-000000007521", status: "pending-approval", reason: "Superseded course resource", requested_at: "2026-08-06T14:00:00.000Z" }] };
  if (/^\/v1\/storage\/assets\/[0-9a-f-]{36}\/delivery$/i.test(pathname)) return { url: "https://demo.veza.local/assets/preview", expiresAt: "2026-08-07T11:00:00.000Z" };

  if (pathname === "/v1/service-accounts") return serviceAccounts();
  if (pathname === "/v1/communications/workspace") return communications(false);
  if (pathname === "/v1/communications/recipient-workspace") return communications(true);

  throw new DemoWorkspaceFixtureError(pathname);
}

export const demoFixtureIds = {
  courseRunId: id.run,
  enrolmentId: id.enrolment,
  lessonId: id.lesson,
  courseSpaceId: id.courseSpace,
  demoLearnerPersonId,
  staffPersonId: id.staff,
} as const;
