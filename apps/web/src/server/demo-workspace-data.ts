import "server-only";

import {
  demoInstitutionId,
  demoLearnerPersonId,
  demoNow,
  demoTenantId,
} from "./demo-mode";

const courseRunId = "00000000-0000-4000-8000-000000001201";
const enrolmentId = "00000000-0000-4000-8000-000000001101";
const secondEnrolmentId = "00000000-0000-4000-8000-000000001102";
const blueprintVersionId = "00000000-0000-4000-8000-000000005002";
const academicPeriodId = "00000000-0000-4000-8000-000000004201";
const lessonId = "00000000-0000-4000-8000-000000006201";
const moduleId = "00000000-0000-4000-8000-000000006101";
const courseSpaceId = "00000000-0000-4000-8000-000000006001";
const staffPersonId = "00000000-0000-4000-8000-000000000102";
const secondLearnerPersonId = "00000000-0000-4000-8000-000000000103";
const guardianPersonId = "00000000-0000-4000-8000-000000000104";

function mutationReceipt(path: string): Readonly<Record<string, unknown>> {
  return {
    ok: true,
    demo: true,
    persisted: false,
    path,
    operationId: "00000000-0000-4000-8000-000000009999",
    id: "00000000-0000-4000-8000-000000009998",
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
        id: secondLearnerPersonId,
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
        id: staffPersonId,
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
      {
        id: guardianPersonId,
        version: 1,
        displayName: "Sibusiso Mokoena",
        givenName: "Sibusiso",
        familyName: "Mokoena",
        primaryEmail: "sibusiso.mokoena@demo.veza.local",
        status: "active",
        institutionalIdentifiers: [],
        updatedAt: "2026-08-01T10:30:00.000Z",
      },
    ],
    page: { limit: 30 },
  };
}

function rawPerson(personId: string) {
  const isStaff = personId === staffPersonId;
  const isGuardian = personId === guardianPersonId;
  const isSecondLearner = personId === secondLearnerPersonId;
  const given = isStaff ? "Lerato" : isGuardian ? "Sibusiso" : isSecondLearner ? "Thabo" : "Naledi";
  const family = isStaff ? "Khumalo" : isSecondLearner ? "Dlamini" : "Mokoena";
  const email = `${given.toLowerCase()}.${family.toLowerCase()}@demo.veza.local`;
  return {
    id: personId,
    version: isStaff ? 6 : 4,
    legal_given_names: given,
    legal_family_name: family,
    preferred_name: given,
    date_of_birth: isStaff || isGuardian ? undefined : "2004-06-17",
    locale: "en-ZA",
    status: "active",
    updated_at: demoNow,
    contacts: [
      {
        id: "00000000-0000-4000-8000-000000007001",
        version: 1,
        kind: "email",
        value: email,
        label: "Primary",
        is_primary: true,
        is_verified: true,
        verification_recorded_at: "2026-02-10T09:00:00.000Z",
        valid_from: "2026-01-15T00:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000007002",
        version: 1,
        kind: "mobile",
        value: "+27 72 555 0142",
        label: "Mobile",
        is_primary: true,
        is_verified: false,
        valid_from: "2026-01-15T00:00:00.000Z",
      },
    ],
    addresses: [
      {
        id: "00000000-0000-4000-8000-000000007011",
        version: 1,
        address_type: "residential",
        address: {
          line1: "17 Demo Street",
          city: "Johannesburg",
          province: "Gauteng",
          postalCode: "2001",
          country: "ZA",
        },
        is_primary: true,
        valid_from: "2026-01-15T00:00:00.000Z",
      },
    ],
    identifiers: [
      {
        id: "00000000-0000-4000-8000-000000007021",
        version: 1,
        institution_id: demoInstitutionId,
        identifier_type: isStaff ? "employee-number" : "student-number",
        identifier_value: isStaff ? "AKH-S-0047" : "AKH-L-2026-0142",
        issuing_authority: "Akha Academy",
        valid_from: "2026-01-15T00:00:00.000Z",
      },
    ],
    organisational_assignments: isStaff
      ? [
          {
            id: "00000000-0000-4000-8000-000000007031",
            version: 1,
            institution_id: demoInstitutionId,
            organisational_unit_id: "00000000-0000-4000-8000-000000004301",
            assignment_type: "teaching",
            title: "Senior facilitator",
            is_primary: true,
            valid_from: "2026-01-15T00:00:00.000Z",
          },
        ]
      : [],
    staff_engagements: isStaff
      ? [
          {
            id: "00000000-0000-4000-8000-000000007041",
            version: 2,
            institution_id: demoInstitutionId,
            organisational_unit_id: "00000000-0000-4000-8000-000000004301",
            engagement_type: "employee",
            employee_number: "AKH-S-0047",
            title: "Senior facilitator",
            status: "active",
            started_on: "2025-01-15",
          },
        ]
      : [],
    consents: [],
    disclosure_restrictions: [],
    identity_link_requests: [],
    data_subject_requests: [],
    learner: !isStaff && !isGuardian
      ? {
          person_id: personId,
          institution_id: demoInstitutionId,
          status: "active",
          admission_date: "2026-01-15",
        }
      : undefined,
    staff: isStaff
      ? {
          person_id: personId,
          institution_id: demoInstitutionId,
          status: "active",
          employee_number: "AKH-S-0047",
          engagement_type: "employee",
          started_on: "2025-01-15",
        }
      : undefined,
    relationships: personId === demoLearnerPersonId
      ? [
          {
            id: "00000000-0000-4000-8000-000000007051",
            version: 2,
            institution_id: demoInstitutionId,
            related_person_id: guardianPersonId,
            relationship_type: "guardian",
            verified_at: "2026-02-02T08:00:00.000Z",
            valid_from: "2026-01-15T00:00:00.000Z",
            authority: { canReceiveCommunications: true, canAccessRecords: true },
          },
        ]
      : [],
  };
}

function peopleReferences() {
  return {
    institutionId: demoInstitutionId,
    organisationalUnits: [
      {
        id: "00000000-0000-4000-8000-000000004301",
        code: "DIGITAL",
        displayName: "School of Digital Learning",
        unitType: "school",
      },
      {
        id: "00000000-0000-4000-8000-000000004302",
        code: "STUDENT",
        displayName: "Student Success",
        unitType: "centre",
      },
    ],
    linkableIdentities: [
      {
        userId: "00000000-0000-4000-8000-000000008001",
        displayName: "Naledi Mokoena",
        email: "naledi.mokoena@demo.veza.local",
        roles: ["learner"],
      },
      {
        userId: "00000000-0000-4000-8000-000000008002",
        displayName: "Lerato Khumalo",
        email: "lerato.khumalo@demo.veza.local",
        roles: ["instructor"],
      },
    ],
  };
}

function catalogueWorkspace() {
  return {
    institutionId: demoInstitutionId,
    programmes: [
      {
        id: "00000000-0000-4000-8000-000000005001",
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
      },
    ],
    blueprints: [
      {
        id: blueprintVersionId,
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
        outcomeCount: 3,
        requisiteCount: 0,
        version: 6,
      },
    ],
    outcomes: [
      {
        id: "00000000-0000-4000-8000-000000005201",
        institutionId: demoInstitutionId,
        code: "DL-O1",
        title: "Interpret structured data in context",
        outcomeType: "skill",
        levelCode: "NQF5",
        status: "active",
        version: 2,
      },
      {
        id: "00000000-0000-4000-8000-000000005202",
        institutionId: demoInstitutionId,
        code: "DL-O2",
        title: "Communicate evidence-based findings",
        outcomeType: "competency",
        levelCode: "NQF5",
        status: "active",
        version: 1,
      },
    ],
    runs: [
      {
        id: courseRunId,
        institutionId: demoInstitutionId,
        academicPeriodId,
        blueprintVersionId,
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
      },
    ],
    enrolments: [
      {
        id: enrolmentId,
        institutionId: demoInstitutionId,
        learnerPersonId: demoLearnerPersonId,
        learnerDisplayName: "Naledi Mokoena",
        courseRunId,
        courseRunTitle: "Data Literacy Foundations",
        classSectionId: "00000000-0000-4000-8000-000000005301",
        cohortId: "00000000-0000-4000-8000-000000005401",
        status: "active",
        enrolledOn: "2026-06-20",
        effectiveFrom: "2026-07-20",
        version: 3,
      },
      {
        id: secondEnrolmentId,
        institutionId: demoInstitutionId,
        learnerPersonId: secondLearnerPersonId,
        learnerDisplayName: "Thabo Dlamini",
        courseRunId,
        courseRunTitle: "Data Literacy Foundations",
        classSectionId: "00000000-0000-4000-8000-000000005301",
        cohortId: "00000000-0000-4000-8000-000000005401",
        status: "active",
        enrolledOn: "2026-06-21",
        effectiveFrom: "2026-07-20",
        version: 2,
      },
    ],
  };
}

function catalogueReferences() {
  return {
    academicPeriods: [
      {
        id: academicPeriodId,
        code: "2026-S2",
        title: "Semester 2 2026",
        startsOn: "2026-07-13",
        endsOn: "2026-11-20",
      },
    ],
    eligibleLearners: [
      { id: demoLearnerPersonId, displayName: "Naledi Mokoena", learnerStatus: "active" },
      { id: secondLearnerPersonId, displayName: "Thabo Dlamini", learnerStatus: "active" },
    ],
    eligibleStaff: [
      {
        id: staffPersonId,
        displayName: "Lerato Khumalo",
        staffStatus: "active",
        employeeNumber: "AKH-S-0047",
      },
    ],
    cohorts: [
      {
        id: "00000000-0000-4000-8000-000000005401",
        code: "DL26-B",
        title: "Digital Learning 2026 B",
        status: "active",
      },
    ],
    classes: [
      {
        id: "00000000-0000-4000-8000-000000005301",
        courseRunId,
        cohortId: "00000000-0000-4000-8000-000000005401",
        code: "DL101-A",
        title: "Data Literacy A",
        status: "active",
        version: 4,
      },
    ],
  };
}

function learnerHome() {
  return {
    learnerPersonId: demoLearnerPersonId,
    generatedAt: demoNow,
    today: [
      {
        id: lessonId,
        kind: "lesson",
        courseRunId,
        title: "Reading a dataset critically",
        courseTitle: "Data Literacy Foundations",
        href: `/courses/${enrolmentId}`,
        priority: 1,
      },
      {
        id: "00000000-0000-4000-8000-000000007101",
        kind: "assignment",
        courseRunId,
        title: "Lab 2: Evidence and interpretation",
        courseTitle: "Data Literacy Foundations",
        dueAt: "2026-08-10T15:00:00.000Z",
        href: "/assessments",
        priority: 2,
      },
    ],
    courses: [
      {
        enrolmentId,
        courseRunId,
        courseTitle: "Data Literacy Foundations",
        deliveryMode: "blended",
        nextLessonId: lessonId,
        nextLessonTitle: "Reading a dataset critically",
        progressPercent: 62,
        completedLessons: 5,
        totalLessons: 8,
        startsOn: "2026-07-20",
        endsOn: "2026-10-09",
      },
    ],
  };
}

function learnerCourseRoom(requestedEnrolmentId: string) {
  return {
    enrolmentId: requestedEnrolmentId,
    courseRunId,
    courseTitle: "Data Literacy Foundations",
    publicationSnapshotId: "00000000-0000-4000-8000-000000006401",
    publicationChecksum: "demo-dl101-publication-v4",
    progressPercent: 62,
    completedLessons: 5,
    totalLessons: 8,
    modules: [
      {
        id: moduleId,
        title: "Working with evidence",
        description: "Build practical habits for reading and communicating data.",
        sequenceNumber: 2,
        completionPercent: 50,
        lessons: [
          {
            id: lessonId,
            moduleId,
            title: "Reading a dataset critically",
            summary: "Separate observation, interpretation and claim.",
            sequenceNumber: 1,
            estimatedMinutes: 25,
            blocks: [
              {
                id: "00000000-0000-4000-8000-000000006301",
                type: "heading",
                data: { text: "Evidence before conclusions", level: 2 },
              },
              {
                id: "00000000-0000-4000-8000-000000006302",
                type: "paragraph",
                data: {
                  text: "Review the source, sample and measurement method before interpreting a pattern.",
                },
              },
              {
                id: "00000000-0000-4000-8000-000000006303",
                type: "callout",
                data: { title: "Practice", text: "Write one observation that does not infer a cause." },
              },
            ],
            completionRule: { type: "view" },
            completed: false,
            bookmarked: true,
          },
        ],
      },
    ],
    announcements: [
      {
        id: "00000000-0000-4000-8000-000000006501",
        title: "Lab support session",
        body: "A live support session is scheduled for Friday at 14:00.",
        publishedAt: "2026-08-06T10:00:00.000Z",
      },
    ],
    timetable: [
      {
        id: "00000000-0000-4000-8000-000000006511",
        title: "Data Literacy live class",
        startsAt: "2026-08-11T08:00:00.000Z",
        endsAt: "2026-08-11T09:30:00.000Z",
        location: "Room 2A / Teams",
      },
    ],
    discussions: [
      {
        id: "00000000-0000-4000-8000-000000006521",
        title: "What makes a source trustworthy?",
        replyCount: 8,
        updatedAt: "2026-08-07T08:20:00.000Z",
      },
    ],
    offlineAvailable: true,
    dataFreshness: demoNow,
  };
}

function studioWorkspace() {
  return {
    institutionId: demoInstitutionId,
    spaces: [
      {
        id: courseSpaceId,
        institutionId: demoInstitutionId,
        blueprintVersionId,
        title: "Data Literacy Foundations",
        status: "published",
        moduleCount: 3,
        lessonCount: 8,
        currentPublicationId: "00000000-0000-4000-8000-000000006401",
        version: 9,
      },
    ],
    modules: [
      {
        id: moduleId,
        courseSpaceId,
        title: "Working with evidence",
        description: "Practical data-reading habits.",
        sequenceNumber: 2,
        availabilityRule: {},
        completionRule: { type: "all-lessons" },
        status: "active",
        version: 3,
      },
    ],
    lessons: [
      {
        id: lessonId,
        courseSpaceId,
        moduleId,
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
      },
    ],
  };
}

function studioLibrary() {
  return {
    institutionId: demoInstitutionId,
    reusableBlocks: [
      {
        id: "00000000-0000-4000-8000-000000006601",
        name: "Source evaluation prompt",
        blockType: "callout",
        content: { title: "Check the source", text: "Who produced this evidence and why?" },
        status: "active",
        version: 2,
        updatedAt: "2026-08-05T10:00:00.000Z",
      },
    ],
    assets: [
      {
        id: "00000000-0000-4000-8000-000000006701",
        courseSpaceId,
        assetKind: "document",
        objectKey: "demo/data-literacy/source-evaluation.pdf",
        originalFilename: "source-evaluation-guide.pdf",
        mediaType: "application/pdf",
        sizeBytes: 248320,
        checksumSha256: "demo-source-evaluation-checksum",
        malwareStatus: "clean",
        metadata: { pages: 4 },
        status: "ready",
        version: 2,
        createdAt: "2026-07-30T09:00:00.000Z",
        updatedAt: "2026-08-02T12:00:00.000Z",
      },
    ],
    publications: [
      {
        id: "00000000-0000-4000-8000-000000006401",
        courseSpaceId,
        courseTitle: "Data Literacy Foundations",
        publicationNumber: 4,
        sourceReviewId: "00000000-0000-4000-8000-000000006801",
        checksumSha256: "demo-dl101-publication-v4",
        status: "current",
        publishedAt: "2026-08-04T11:30:00.000Z",
      },
    ],
    importReports: [
      {
        id: "00000000-0000-4000-8000-000000006901",
        courseSpaceId,
        sourceFormat: "common-cartridge",
        sourceChecksum: "demo-import-checksum",
        compatibilityStatus: "compatible-with-warnings",
        report: { warnings: 2, importedLessons: 8 },
        createdAt: "2026-07-25T07:45:00.000Z",
      },
    ],
  };
}

function studioLesson(requestedLessonId: string) {
  return {
    id: requestedLessonId,
    courseSpaceId,
    moduleId,
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
    revisions: [
      {
        id: "00000000-0000-4000-8000-000000006311",
        lessonId: requestedLessonId,
        revisionNumber: 4,
        blocks: [
          {
            id: "00000000-0000-4000-8000-000000006302",
            type: "paragraph",
            data: { text: "Review source, sample and method before interpreting a pattern." },
          },
        ],
        checksumSha256: "demo-lesson-revision-v4",
        changeSummary: "Clarified the evidence checklist and practice activity.",
        accessibilityReport: { passed: true, findings: [], checkedAt: demoNow },
        linkReport: { passed: true, findings: [], checkedAt: demoNow },
        readingMetrics: { words: 690, minutes: 4 },
        createdBy: staffPersonId,
        createdAt: "2026-08-04T09:15:00.000Z",
      },
    ],
    comments: [
      {
        id: "00000000-0000-4000-8000-000000006811",
        revisionId: "00000000-0000-4000-8000-000000006311",
        body: "The practice example now aligns with the stated outcome.",
        status: "resolved",
        version: 2,
        createdBy: staffPersonId,
        resolvedBy: staffPersonId,
        resolvedAt: "2026-08-04T10:00:00.000Z",
        createdAt: "2026-08-04T09:30:00.000Z",
        updatedAt: "2026-08-04T10:00:00.000Z",
      },
    ],
    reviews: [
      {
        id: "00000000-0000-4000-8000-000000006801",
        revisionId: "00000000-0000-4000-8000-000000006311",
        status: "approved",
        requestedBy: staffPersonId,
        requestedAt: "2026-08-04T09:20:00.000Z",
        reviewedBy: "00000000-0000-4000-8000-000000008011",
        reviewedAt: "2026-08-04T10:15:00.000Z",
        decisionNotes: "Approved for publication.",
        version: 2,
      },
    ],
  };
}

function academicEvidenceWorkspace() {
  const assignmentId = "00000000-0000-4000-8000-000000007201";
  return {
    institutionId: demoInstitutionId,
    assignments: [
      {
        id: assignmentId,
        institutionId: demoInstitutionId,
        courseRunId,
        courseRunTitle: "Data Literacy Foundations",
        title: "Lab 2: Evidence and interpretation",
        dueAt: "2026-08-10T15:00:00.000Z",
        status: "published",
        groupMode: "individual",
        maxAttempts: 2,
        allowedFormats: ["text", "file"],
        submissionCount: 31,
        version: 4,
      },
      {
        id: "00000000-0000-4000-8000-000000007202",
        institutionId: demoInstitutionId,
        courseRunId,
        courseRunTitle: "Data Literacy Foundations",
        title: "Final evidence brief",
        dueAt: "2026-09-28T15:00:00.000Z",
        status: "draft",
        groupMode: "group",
        maxAttempts: 1,
        allowedFormats: ["file", "url"],
        submissionCount: 0,
        version: 1,
      },
    ],
    submissions: [
      {
        id: "00000000-0000-4000-8000-000000007211",
        assignmentId,
        assignmentTitle: "Lab 2: Evidence and interpretation",
        enrolmentId,
        learnerPersonId: demoLearnerPersonId,
        learnerName: "Naledi Mokoena",
        attemptNumber: 1,
        status: "submitted",
        isLate: false,
        fileCount: 1,
        allFilesClean: true,
        receiptNumber: "AKH-2026-000184",
        submittedAt: "2026-08-07T08:40:00.000Z",
      },
    ],
    gradebooks: [
      {
        courseRunId,
        courseRunTitle: "Data Literacy Foundations",
        itemCount: 4,
        publishedResultCount: 68,
        draftResultCount: 4,
        formulaVersion: 3,
        passMark: 50,
      },
    ],
    certificates: [
      {
        id: "00000000-0000-4000-8000-000000007221",
        learnerPersonId: secondLearnerPersonId,
        learnerName: "Thabo Dlamini",
        status: "issued",
        issuedAt: "2026-07-18T11:00:00.000Z",
        verificationCode: "AKH26DL1042",
        payload: { credentialTitle: "Digital Learning Practice" },
      },
    ],
    exports: [
      {
        id: "00000000-0000-4000-8000-000000007231",
        exportType: "gradebook",
        format: "csv",
        rowCount: 36,
        status: "ready",
        requestedAt: "2026-08-06T13:10:00.000Z",
        completedAt: "2026-08-06T13:10:04.000Z",
      },
    ],
    rubrics: [
      {
        id: "00000000-0000-4000-8000-000000007241",
        title: "Evidence interpretation rubric",
        lifecycle: "approved",
        versionNumber: 2,
        criteriaCount: 4,
      },
    ],
    assignmentGroups: [
      {
        id: "00000000-0000-4000-8000-000000007251",
        assignmentId,
        title: "Research team A",
        memberCount: 4,
      },
    ],
    certificateTemplates: [
      {
        id: "00000000-0000-4000-8000-000000007261",
        title: "Short course completion certificate",
        status: "active",
      },
    ],
    awardRules: [
      {
        id: "00000000-0000-4000-8000-000000007271",
        title: "Complete programme with published passing result",
        status: "active",
      },
    ],
  };
}

function gradebookSummary() {
  return {
    courseRunId,
    categories: [
      { id: "00000000-0000-4000-8000-000000007301", title: "Coursework", weight: 0.6 },
      { id: "00000000-0000-4000-8000-000000007302", title: "Final task", weight: 0.4 },
    ],
    items: [
      {
        id: "00000000-0000-4000-8000-000000007311",
        title: "Lab 2",
        maximumScore: 100,
        weight: 0.25,
      },
    ],
    formula: { version: 3, type: "weighted-sum", passMark: 50 },
    results: [
      {
        id: "00000000-0000-4000-8000-000000007321",
        enrolmentId,
        learnerName: "Naledi Mokoena",
        score: 78,
        percentage: 78,
        state: "published",
      },
      {
        id: "00000000-0000-4000-8000-000000007322",
        enrolmentId: secondEnrolmentId,
        learnerName: "Thabo Dlamini",
        score: 84,
        percentage: 84,
        state: "published",
      },
    ],
  };
}

function analyticsMetrics() {
  return [
    {
      key: "active-learners",
      title: "Active learners",
      description: "Learners with an active enrolment in the current period.",
      unit: "learners",
      value: 428,
      measuredAt: demoNow,
      sourceMaxOccurredAt: "2026-08-07T09:55:00.000Z",
      freshnessSeconds: 300,
      drillthroughFilter: { status: "active" },
    },
    {
      key: "course-completion",
      title: "Course completion",
      description: "Completion rate across course runs ending this term.",
      unit: "%",
      value: 81.4,
      measuredAt: demoNow,
      sourceMaxOccurredAt: "2026-08-07T09:50:00.000Z",
      freshnessSeconds: 600,
      drillthroughFilter: { period: "2026-S2" },
    },
    {
      key: "submission-on-time",
      title: "On-time submissions",
      description: "Submitted attempts received before their effective due time.",
      unit: "%",
      value: 92.7,
      measuredAt: demoNow,
      sourceMaxOccurredAt: "2026-08-07T09:58:00.000Z",
      freshnessSeconds: 120,
      drillthroughFilter: { late: false },
    },
    {
      key: "intervention-open",
      title: "Open interventions",
      description: "Learners currently flagged for staff follow-up.",
      unit: "learners",
      value: 17,
      measuredAt: demoNow,
      sourceMaxOccurredAt: "2026-08-07T09:45:00.000Z",
      freshnessSeconds: 900,
      drillthroughFilter: { intervention: "open" },
    },
  ];
}

function terminologyVersions() {
  return [
    {
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
        { canonicalKey: "staff", singularLabel: "Staff member", pluralLabel: "Staff" },
        { canonicalKey: "programme", singularLabel: "Programme", pluralLabel: "Programmes" },
        { canonicalKey: "course", singularLabel: "Course", pluralLabel: "Courses" },
        { canonicalKey: "class", singularLabel: "Class", pluralLabel: "Classes" },
      ],
      programmeHierarchy: [
        {
          levelOrder: 1,
          canonicalType: "programme",
          singularLabel: "Programme",
          pluralLabel: "Programmes",
          isRequired: true,
          minimumOccurrences: 1,
        },
        {
          levelOrder: 2,
          canonicalType: "course",
          singularLabel: "Course",
          pluralLabel: "Courses",
          isRequired: true,
          minimumOccurrences: 1,
        },
      ],
    },
  ];
}

function resolvedTerminology() {
  const label = (singular: string, plural: string, short?: string) => ({
    singular,
    plural,
    ...(short ? { short } : {}),
  });
  return {
    institutionId: demoInstitutionId,
    requestedLocale: "en-ZA",
    resolvedLocale: "en-ZA",
    terminologyVersionId: "00000000-0000-4000-8000-000000007401",
    effectiveAt: demoNow,
    labels: {
      learner: label("Learner", "Learners"),
      staff: label("Staff member", "Staff"),
      guardian: label("Guardian", "Guardians"),
      sponsor: label("Sponsor", "Sponsors"),
      programme: label("Programme", "Programmes"),
      qualification: label("Qualification", "Qualifications"),
      "learning-path": label("Learning path", "Learning paths"),
      subject: label("Subject", "Subjects"),
      module: label("Module", "Modules"),
      course: label("Course", "Courses"),
      grade: label("Grade", "Grades"),
      year: label("Year", "Years"),
      level: label("Level", "Levels"),
      cohort: label("Cohort", "Cohorts"),
      class: label("Class", "Classes"),
      "academic-period": label("Academic period", "Academic periods"),
      outcome: label("Outcome", "Outcomes"),
      competency: label("Competency", "Competencies"),
    },
    programmeHierarchy: terminologyVersions()[0].programmeHierarchy,
  };
}

function storageWorkspace() {
  return {
    tenantId: demoTenantId,
    generatedAt: demoNow,
    storedBytes: 19_486_736_384,
    quota: { limitBytes: 53_687_091_200, warningPercent: 85, status: "healthy" },
    namespaces: [
      {
        id: "00000000-0000-4000-8000-000000007501",
        key: "learning-content",
        displayName: "Learning content",
        storedBytes: 12_884_901_888,
        assetCount: 318,
      },
      {
        id: "00000000-0000-4000-8000-000000007502",
        key: "submissions",
        displayName: "Learner submissions",
        storedBytes: 6_601_834_496,
        assetCount: 942,
      },
    ],
    policies: [
      {
        id: "00000000-0000-4000-8000-000000007511",
        namespace_key: "learning-content",
        retention_days: 2555,
        status: "active",
      },
    ],
    assets: [
      {
        id: "00000000-0000-4000-8000-000000007521",
        namespace_key: "learning-content",
        original_filename: "source-evaluation-guide.pdf",
        media_type: "application/pdf",
        size_bytes: 248320,
        status: "ready",
        accessibility_status: "complete",
        created_at: "2026-07-30T09:00:00.000Z",
      },
    ],
    processingJobs: [
      {
        id: "00000000-0000-4000-8000-000000007531",
        job_type: "video-transcode",
        state: "completed",
        asset_id: "00000000-0000-4000-8000-000000007522",
        updated_at: "2026-08-06T11:15:00.000Z",
      },
    ],
    monthlyUsage: [
      { month: "2026-06", stored_bytes: 14_208_323_584, egress_bytes: 3_102_441_984 },
      { month: "2026-07", stored_bytes: 17_612_845_056, egress_bytes: 4_885_102_592 },
      { month: "2026-08", stored_bytes: 19_486_736_384, egress_bytes: 1_248_702_464 },
    ],
    recordingConsents: [
      {
        id: "00000000-0000-4000-8000-000000007541",
        person_id: demoLearnerPersonId,
        purpose: "live-session-recording",
        state: "granted",
        granted_at: "2026-07-18T08:00:00.000Z",
      },
    ],
  };
}

function serviceAccounts() {
  return {
    items: [
      {
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
        principal: {
          userId: "00000000-0000-4000-8000-000000007611",
          displayName: "SIS integration",
        },
        activeSecret: { prefix: "vza_demo_", createdAt: "2026-07-01T10:00:00.000Z" },
      },
    ],
  };
}

function communicationsWorkspace() {
  return {
    tenantId: demoTenantId,
    generatedAt: demoNow,
    templates: [
      {
        id: "00000000-0000-4000-8000-000000007701",
        display_name: "Assignment reminder",
        template_key: "learning.assignment-reminder",
        topic_key: "learning.assignments",
        policy: "optional",
        active_version_number: 2,
        status: "active",
      },
      {
        id: "00000000-0000-4000-8000-000000007702",
        display_name: "Result released",
        template_key: "learning.result-released",
        topic_key: "learning.results",
        policy: "required",
        active_version_number: 3,
        status: "active",
      },
    ],
    senders: [
      {
        id: "00000000-0000-4000-8000-000000007711",
        sender_identity: "notifications@demo.veza.local",
        provider_key: "http-email",
        channel: "email",
        status: "active",
        verified_at: "2026-04-15T08:00:00.000Z",
      },
    ],
    preferences: [],
    recentDeliveries: [
      {
        id: "00000000-0000-4000-8000-000000007721",
        template_key: "learning.assignment-reminder",
        topic_key: "learning.assignments",
        channel: "email",
        provider_key: "http-email",
        state: "delivered",
        attempts: 1,
        updated_at: "2026-08-07T09:20:00.000Z",
      },
    ],
    activeSuppressions: [],
  };
}

function recipientCommunicationsWorkspace() {
  return {
    generatedAt: demoNow,
    preferences: [
      {
        id: "00000000-0000-4000-8000-000000007731",
        topic_key: "*",
        channel: "email",
        state: "enabled",
        digest_frequency: null,
        quiet_hours: { timezone: "Africa/Johannesburg", start: "21:00", end: "07:00" },
        version: 1,
        updated_at: demoNow,
      },
    ],
    notifications: [
      {
        id: "00000000-0000-4000-8000-000000007741",
        template_key: "learning.assignment-reminder",
        topic_key: "learning.assignments",
        policy: "optional",
        requested_channels: ["email", "push"],
        status: "completed",
        scheduled_at: "2026-08-07T08:00:00.000Z",
        created_at: "2026-08-07T08:00:00.000Z",
        completed_at: "2026-08-07T08:00:03.000Z",
        channel: "email",
        delivery_state: "delivered",
        content_snapshot: {
          subject: "Assignment due Monday",
          body: "Lab 2 is due Monday at 17:00.",
        },
        activity_at: "2026-08-07T08:00:03.000Z",
      },
    ],
  };
}

export class DemoWorkspaceFixtureError extends Error {
  constructor(readonly path: string) {
    super(`Demo data is not configured for ${path}`);
    this.name = "DemoWorkspaceFixtureError";
  }
}

export function resolveDemoWorkspaceRequest(
  path: string,
  init?: RequestInit,
): unknown {
  const method = (init?.method ?? "GET").toUpperCase();
  const url = new URL(path, "https://demo.veza.local");
  const pathname = url.pathname;

  if (method !== "GET" && method !== "HEAD") return mutationReceipt(pathname);

  if (pathname === "/v1/people") return peopleDirectory();
  if (pathname === "/v1/people/duplicates") {
    return {
      items: [
        {
          id: "00000000-0000-4000-8000-000000007801",
          leftPerson: { id: demoLearnerPersonId, displayName: "Naledi Mokoena", version: 4 },
          rightPerson: { id: secondLearnerPersonId, displayName: "Thabo Dlamini", version: 2 },
          matchScore: 0.73,
          reasons: ["shared mobile number", "similar imported identifier"],
          status: "open",
          createdAt: "2026-08-06T07:30:00.000Z",
        },
      ],
      page: { limit: 20 },
    };
  }
  if (/^\/v1\/people\/institutions\/[0-9a-f-]{36}\/references$/i.test(pathname)) {
    return peopleReferences();
  }
  const person = pathname.match(/^\/v1\/people\/([0-9a-f-]{36})$/i);
  if (person) return rawPerson(person[1]);

  if (/^\/v1\/institutions\/[0-9a-f-]{36}\/catalogue\/references$/i.test(pathname)) {
    return catalogueReferences();
  }
  if (/^\/v1\/institutions\/[0-9a-f-]{36}\/catalogue$/i.test(pathname)) {
    return catalogueWorkspace();
  }

  if (/^\/v1\/institutions\/[0-9a-f-]{36}\/terminology\/resolved$/i.test(pathname)) {
    return resolvedTerminology();
  }
  if (/^\/v1\/institutions\/[0-9a-f-]{36}\/terminology$/i.test(pathname)) {
    return terminologyVersions();
  }

  if (/^\/v1\/institutions\/[0-9a-f-]{36}\/studio\/library$/i.test(pathname)) {
    return studioLibrary();
  }
  const studioLessonMatch = pathname.match(
    /^\/v1\/institutions\/[0-9a-f-]{36}\/studio\/lessons\/([0-9a-f-]{36})$/i,
  );
  if (studioLessonMatch) return studioLesson(studioLessonMatch[1]);
  if (/^\/v1\/institutions\/[0-9a-f-]{36}\/studio$/i.test(pathname)) {
    return studioWorkspace();
  }

  if (pathname === "/v1/learner/home") return learnerHome();
  const learnerCourseMatch = pathname.match(
    /^\/v1\/learner\/enrolments\/([0-9a-f-]{36})\/course-room$/i,
  );
  if (learnerCourseMatch) return learnerCourseRoom(learnerCourseMatch[1]);
  if (pathname === "/v1/learner/assignments") {
    return {
      learnerPersonId: demoLearnerPersonId,
      assignments: academicEvidenceWorkspace().assignments,
      generatedAt: demoNow,
    };
  }
  if (/^\/v1\/learner\/gradebook\/[0-9a-f-]{36}$/i.test(pathname)) {
    return gradebookSummary();
  }

  if (/^\/v1\/institutions\/[0-9a-f-]{36}\/academic-evidence$/i.test(pathname)) {
    return academicEvidenceWorkspace();
  }
  if (/^\/v1\/academic-evidence\/gradebook\/[0-9a-f-]{36}\/staff$/i.test(pathname)) {
    return gradebookSummary();
  }
  if (/^\/v1\/academic-evidence\/gradebook\/[0-9a-f-]{36}$/i.test(pathname)) {
    return gradebookSummary();
  }
  if (pathname === "/v1/academic-evidence/analytics") return analyticsMetrics();

  if (pathname === "/v1/storage/workspace") return storageWorkspace();
  if (pathname === "/v1/storage/deletion-requests") {
    return {
      items: [
        {
          id: "00000000-0000-4000-8000-000000007901",
          asset_id: "00000000-0000-4000-8000-000000007521",
          status: "pending-approval",
          reason: "Superseded course resource",
          requested_at: "2026-08-06T14:00:00.000Z",
        },
      ],
    };
  }
  if (/^\/v1\/storage\/assets\/[0-9a-f-]{36}\/delivery$/i.test(pathname)) {
    return { url: "https://demo.veza.local/assets/preview", expiresAt: "2026-08-07T11:00:00.000Z" };
  }

  if (pathname === "/v1/service-accounts") return serviceAccounts();
  if (pathname === "/v1/communications/workspace") return communicationsWorkspace();
  if (pathname === "/v1/communications/recipient-workspace") {
    return recipientCommunicationsWorkspace();
  }

  throw new DemoWorkspaceFixtureError(pathname);
}

export const demoFixtureIds = {
  courseRunId,
  enrolmentId,
  lessonId,
  courseSpaceId,
  demoLearnerPersonId,
  staffPersonId,
} as const;
