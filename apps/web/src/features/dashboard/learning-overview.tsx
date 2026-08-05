import Link from "next/link";
import { Icon } from "../../components/icon";
import { ProgressRing } from "./progress-ring";

export function LearningOverview() {
  return (
    <section className="bento" aria-label="Learning overview">
      <article className="continue-card panel">
        <div className="card-top">
          <span className="pill">In progress</span>
          <span className="course-position">Lesson 4 of 8</span>
        </div>
        <div className="continue-content">
          <div>
            <p className="muted">Advanced Product Design</p>
            <h2>Designing for complex systems</h2>
            <p className="lesson-meta">38 minutes remaining. Progress is based on completed lesson activities.</p>
            <Link className="dark-button" href="/learning">
              <span className="play"><Icon name="play" /></span>
              Continue learning
            </Link>
          </div>
          <ProgressRing value={72} />
        </div>
        <div className="lesson-art" aria-hidden="true">
          <div className="art-grid" />
          <div className="art-index">04</div>
          <div className="art-copy"><b>Complex</b><span>systems</span></div>
        </div>
      </article>

      <article className="next-card panel">
        <div className="section-heading">
          <div><p className="eyebrow">Up next</p><h2>Today&apos;s schedule</h2></div>
          <Link href="/calendar">View day <Icon name="arrow" /></Link>
        </div>
        <div className="timeline">
          <div className="time active">
            <span>18:30</span><i />
            <div><small>Live session, 60 min</small><strong>Research methods workshop</strong><p>Dr N. Mthembu, Studio 2</p></div>
            <Link className="join-action" href="/calendar">Join</Link>
          </div>
          <div className="time">
            <span>20:00</span><i />
            <div><small>Self-paced, 35 min</small><strong>Business writing practice</strong><p>Module 3, Activity 2</p></div>
          </div>
        </div>
      </article>

      <article className="progress-card panel">
        <div className="section-heading">
          <div><p className="eyebrow">This term</p><h2>Your progress</h2></div>
          <Link href="/insights">Open detail <Icon name="arrow" /></Link>
        </div>
        <div className="progress-figure">
          <strong>68%</strong><span>published course completion</span>
          <div className="bar"><i style={{ width: "68%" }} /></div>
          <div className="axis"><small>Started 03 Jun</small><small>Ends 26 Sep</small></div>
        </div>
        <dl className="metrics">
          <div><dt>18</dt><dd>Lessons complete</dd></div>
          <div><dt>4</dt><dd>Released assessments</dd></div>
          <div><dt>87%</dt><dd>Average released score</dd></div>
        </dl>
        <p className="metric-context">Updated today from published completion and released result records.</p>
      </article>

      <article className="deadline-card panel">
        <div className="deadline-icon" aria-hidden="true">!</div>
        <p className="eyebrow">Due in 2 days</p>
        <h2>Brand strategy case study</h2>
        <p>Business Communication, Assignment 3</p>
        <div className="deadline-footer">
          <span>Estimated effort: 2 h 30 min</span>
          <Link href="/learning">Open task <Icon name="arrow" /></Link>
        </div>
      </article>
    </section>
  );
}
