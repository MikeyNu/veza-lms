import Link from "next/link";
import { AppShell } from "../../src/components/app-shell";
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

export default async function HelpPage() {
  const resolution = await requireWorkspaceSession();
  const role = primaryRole(resolution.session);
  const guidance = roleGuidance[role as keyof typeof roleGuidance] ?? {
    title: "Veza help",
    description: "Start with the workspace that owns the task. Use institutional support for access and policy questions, and platform support for verified service incidents.",
  };

  return (
    <AppShell session={resolution.session} active="help">
      <section className="workspace help-workspace" aria-labelledby="help-title">
        <header className="help-heading">
          <div>
            <h1 id="help-title">{guidance.title}</h1>
            <p>{guidance.description}</p>
          </div>
          <Link className="help-support-link" href="/support">Open support cases</Link>
        </header>

        <div className="help-layout">
          <section className="help-directory" aria-labelledby="help-directory-title">
            <header>
              <h2 id="help-directory-title">Choose what you need help with</h2>
              <p>Each route keeps the task inside its authorised institutional boundary.</p>
            </header>
            <nav aria-label="Help topics">
              <Link href="/learning"><span>Learning and course access</span><small>Lessons, course rooms and learner progress</small></Link>
              <Link href="/assessments"><span>Assessments and results</span><small>Assignments, marking, moderation and grade evidence</small></Link>
              <Link href="/calendar"><span>Calendar and timetable</span><small>Scheduled teaching, sessions and attendance context</small></Link>
              <Link href="/communicate"><span>Messages and announcements</span><small>Institution-scoped communication</small></Link>
              <Link href="/people"><span>People and membership</span><small>Available only when your role permits people administration</small></Link>
            </nav>
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
