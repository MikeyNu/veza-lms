import { createServer } from "node:http";

const port = Number(process.env.BROWSER_FIXTURE_PORT ?? 4000);
const accessToken = "qe-browser-token";
const tenantId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const membershipId = "10000000-0000-4000-8000-000000000003";
const institutionId = "10000000-0000-4000-8000-000000000004";
const campusId = "10000000-0000-4000-8000-000000000005";
const unitId = "10000000-0000-4000-8000-000000000006";
const periodId = "10000000-0000-4000-8000-000000000007";
const roleAssignmentId = "10000000-0000-4000-8000-000000000011";
const invitationId = "10000000-0000-4000-8000-000000000012";

const workspaceSession = {
  principal: {
    userId,
    displayName: "Michael Ndhlovu",
    email: "operator@quality.veza.invalid",
  },
  tenant: {
    id: tenantId,
    slug: "quality-institute",
    displayName: "Quality Institute",
    status: "provisioning",
    deploymentTier: "shared",
    residencyRegion: "af-south-1",
    planKey: "growth",
    locale: "en-ZA",
    timezone: "Africa/Johannesburg",
  },
  membership: {
    id: membershipId,
    status: "active",
    roles: ["tenant-owner"],
    institutionIds: [institutionId],
    locale: "en-ZA",
    timezone: "Africa/Johannesburg",
  },
  entitlements: [
    { module: "core", state: "enabled", limits: {} },
    { module: "studio-pro", state: "enabled", limits: {} },
  ],
};

const institutionSummary = {
  id: institutionId,
  code: "QI",
  display_name: "Quality Institute",
  institution_type: "university",
  status: "active",
  active_campuses: 1,
  active_units: 1,
  published_periods: 1,
  approved_policies: ["privacy", "data-retention", "acceptable-use"],
};

const institutionDetail = {
  institution: {
    id: institutionId,
    code: "QI",
    display_name: "Quality Institute",
    legal_name: "Quality Institute of Applied Learning",
    institution_type: "university",
    status: "active",
    locale: "en-ZA",
    timezone: "Africa/Johannesburg",
    contact_email: "registry@quality.veza.invalid",
  },
  campuses: [
    {
      id: campusId,
      code: "JHB",
      display_name: "Johannesburg Campus",
      delivery_mode: "hybrid",
      status: "active",
      is_primary: true,
      timezone: "Africa/Johannesburg",
    },
  ],
  organisationalUnits: [
    {
      id: unitId,
      code: "DIGITAL",
      display_name: "School of Digital Practice",
      unit_type: "school",
      status: "active",
    },
  ],
  academicPeriods: [
    {
      id: periodId,
      code: "AY-2026",
      display_name: "2026 Academic Year",
      period_type: "academic-year",
      status: "published",
      starts_on: "2026-01-12",
      ends_on: "2026-12-04",
      timezone: "Africa/Johannesburg",
    },
  ],
  policies: [
    {
      id: "10000000-0000-4000-8000-000000000008",
      policy_key: "privacy",
      version: 2,
      status: "approved",
      title: "Institution privacy policy",
      effective_from: "2026-01-01",
    },
    {
      id: "10000000-0000-4000-8000-000000000009",
      policy_key: "data-retention",
      version: 1,
      status: "approved",
      title: "Learning records retention policy",
      effective_from: "2026-01-01",
    },
    {
      id: "10000000-0000-4000-8000-000000000010",
      policy_key: "acceptable-use",
      version: 1,
      status: "approved",
      title: "Acceptable use policy",
      effective_from: "2026-01-01",
    },
  ],
};

const readiness = {
  tenantId,
  tenantStatus: "provisioning",
  ready: false,
  evaluatedAt: "2026-08-06T00:00:00.000Z",
  checks: [
    {
      key: "tenant:profile",
      label: "Operational profile",
      passed: true,
      blocking: true,
      detail: "Support, privacy and retention settings are complete.",
    },
    {
      key: `institution:${institutionId}:primary-campus`,
      label: "Primary campus",
      passed: true,
      blocking: true,
      detail: "One active primary campus is configured.",
      institutionId,
    },
    {
      key: `institution:${institutionId}:academic-period`,
      label: "Published academic period",
      passed: true,
      blocking: true,
      detail: "The 2026 academic year is published.",
      institutionId,
    },
    {
      key: `institution:${institutionId}:policies`,
      label: "Required institutional policies",
      passed: false,
      blocking: true,
      detail: "Approve the support escalation policy before activation.",
      institutionId,
    },
  ],
};

const accessDirectory = {
  memberships: [
    {
      id: membershipId,
      userId,
      identity: {
        displayName: "Michael Ndhlovu",
        email: "operator@quality.veza.invalid",
      },
      status: "active",
      locale: "en-ZA",
      timezone: "Africa/Johannesburg",
      createdAt: "2026-01-10T08:00:00.000Z",
      roles: [
        {
          id: roleAssignmentId,
          roleKey: "tenant-owner",
          scopeType: "tenant",
          scopeId: tenantId,
          scopeLabel: "Quality Institute tenant",
          validFrom: "2026-01-10T08:00:00.000Z",
          validUntil: null,
        },
      ],
    },
    {
      id: "10000000-0000-4000-8000-000000000013",
      userId: "10000000-0000-4000-8000-000000000014",
      identity: {
        displayName: "Naledi Mokoena",
        email: "naledi@quality.veza.invalid",
      },
      status: "active",
      locale: "en-ZA",
      timezone: "Africa/Johannesburg",
      createdAt: "2026-03-02T08:30:00.000Z",
      roles: [
        {
          id: "10000000-0000-4000-8000-000000000015",
          roleKey: "registrar",
          scopeType: "institution",
          scopeId: institutionId,
          scopeLabel: "Quality Institute",
          validFrom: "2026-03-02T08:30:00.000Z",
          validUntil: null,
        },
      ],
    },
  ],
  invitations: [
    {
      id: invitationId,
      email: "assessor@quality.veza.invalid",
      roleKey: "assessor",
      scopeType: "institution",
      scopeId: institutionId,
      scopeLabel: "Quality Institute",
      status: "sent",
      expiresAt: "2026-08-20T10:00:00.000Z",
      createdAt: "2026-08-05T10:00:00.000Z",
    },
  ],
  page: {
    limit: 40,
  },
};

function send(response, status, payload) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(payload));
}

function authorized(request, requireMembership = true) {
  if (request.headers.authorization !== `Bearer ${accessToken}`) return false;
  return !requireMembership || request.headers["x-veza-membership-id"] === membershipId;
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `127.0.0.1:${port}`}`);
  if (request.method === "GET" && url.pathname === "/health") {
    send(response, 200, { status: "ready" });
    return;
  }
  if (request.method !== "GET") {
    send(response, 405, { message: "Fixture endpoint is read only." });
    return;
  }
  if (url.pathname === "/v1/session/workspaces") {
    if (!authorized(request, false)) {
      send(response, 401, { message: "Valid fixture authentication is required." });
      return;
    }
    send(response, 200, [{
      membershipId,
      label: "Tenant owner",
      roles: ["tenant-owner"],
      tenant: {
        id: tenantId,
        slug: "quality-institute",
        displayName: "Quality Institute",
        status: "provisioning",
      },
    }]);
    return;
  }
  if (!authorized(request)) {
    send(response, 401, { message: "Valid fixture workspace context is required." });
    return;
  }
  if (url.pathname === "/v1/session/workspace") {
    send(response, 200, workspaceSession);
    return;
  }
  if (url.pathname === "/v1/institution-setup") {
    send(response, 200, {
      profile: {
        identity_mode: "hybrid",
        support_email: "support@quality.veza.invalid",
        privacy_contact_email: "privacy@quality.veza.invalid",
        data_retention_days: 2555,
        learner_support_sla_hours: 24,
      },
      institutions: [institutionSummary],
    });
    return;
  }
  if (url.pathname === "/v1/institution-setup/activation-readiness") {
    send(response, 200, readiness);
    return;
  }
  if (url.pathname === `/v1/institution-setup/institutions/${institutionId}`) {
    send(response, 200, institutionDetail);
    return;
  }
  if (url.pathname === "/v1/access-directory") {
    send(response, 200, accessDirectory);
    return;
  }
  send(response, 404, { message: "Fixture route was not found." });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Browser fixture API listening on http://127.0.0.1:${port}.\n`);
});

function shutdown() {
  server.close((error) => {
    if (error) {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
