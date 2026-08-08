import type { WorkspaceSession } from "@veza/contracts";
import Link from "next/link";
import { AppShell } from "../../src/components/app-shell";
import { Icon } from "../../src/components/icon";
import { canAccessWorkspacePath } from "../../src/features/workspace/access-policy";
import { primaryRole } from "../../src/features/workspace/navigation";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

const roleGuidance = {
  learner: {
    title: "Learning help",
    description: "Find the right route for course access, assessment questions and learning support without exposing private records in an unapproved channel.",
  },
  instructor: {
    title: "Teaching help",
    description: "Use the relevant workspace for class, content and assessment operations. Escalate service incidents only when the task cannot be completed in Veza.",
  },
  registrar: {
    title: "Registrar help",
    description: "Use governed institutional workflows for people, enrolment and academic evidence. Platform support is reserved for verified service incidents.",
  },
} as const;

const helpTopics = [
  { href: "/learning", title: "Learning and course access", description: "Lessons, course rooms and learner progress" },
  { href: "/assessments", title: "Assessments and results", description: "Assignments, marking, moderation and grade evidence" },
  { href: "/calendar", title: "Calendar and timetable", description: "Scheduled teaching, sessions and attendance context" },
  { href: "/communicate", title: "Messages and announcements", description: "Institution-scoped communication" },
  { href: "/people", title: "People and membership", description: "Person records, invitations and institutional membership" },
] as const;

function authorisedHelpTopics(session: WorkspaceSession) {
  return helpTopics.filter((topic) => canAccessWorkspacePath(session, topic.href));
}

export default async function HelpPage() {
  const resolution = await requireWorkspaceSession();
  const role = primaryRole(resolution.session);
  const guidance = roleGuidance[role as keyof typeof roleGuidance] ?? {
    title: "Veza help",
    description: "Start with the workspace that owns the task. Use institutional support for access and policy questions, and platform support for verified service incidents.",
  };
  const topics = authorisedHelpTopics(resolution.session);
  const canOpenSupport = canAccessWorkspacePath(resolution.session, "/support");

  return (
    <AppShell session={resolution.session} active="help">
      <section className="workspace help-workspace" aria-labelledby="help-title">
        <header className="help-heading">
          <div>
            <h1 id="help-title">{guidance.title}</h1>
            <p>{guidance.description}</p>
          </div>
          {canOpenSupport ? <Link className="help-support-link" href="/support">Open support cases</Link> : null}
        </header>

        <div className="help-layout">
          <section className="help-directory" aria-labelledby="help-directory-title">
            <header>
              <h2 id="help-directory-title">Choose what you need help with</h2>
              <p>Only workspaces authorised for your current role are shown here.</p>
            </header>
            {topics.length ? (
              <nav aria-label="Help topics">
                {topics.map((topic) => (
                  <Link href={topic.href} key={topic.href}>
                    <span>{topic.title}</span>
                    <small>{topic.description}</small>
                    <Icon name="chevron-right" size="small" />
                  </Link>
                ))}
              </nav>
            ) : (
              <div className="help-directory-empty">
                <strong>No task workspace is available for this role.</strong>
                <p>Use the account menu for profile guidance or ask an institution administrator to review your membership.</p>
              </div>
            )}
          </section>

          <aside className="help-guidance" aria-labelledby="help-guidance-title">
            <h2 id="help-guidance-title">Before contacting support</h2>
            <ol>
              <li><strong>Use the owning workspace first.</strong><span>Most access and workflow problems are resolved where the institutional record is managed.</span></li>
              <li><strong>Keep sensitive information in Veza.</strong><span>Never send passwords, invitation tokens or learner records through an unapproved channel.</span></li>
              <li><strong>Describe the task, not only the error.</strong><span>Include the affected workspace, the action you were taking and the time the issue occurred.</span></li>
            </ol>
            <div className="help-security-note">
              <strong>Security boundary</strong>
              <p>Veza support does not need your password. Privileged diagnostic access requires an approved case, a defined purpose and an expiry.</p>
            </div>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
