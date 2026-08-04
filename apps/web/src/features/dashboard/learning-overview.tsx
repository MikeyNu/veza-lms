import { Icon } from "../../components/icon";
import { ProgressRing } from "./progress-ring";

export function LearningOverview() {
  return <section className="bento" aria-label="Learning overview">
    <article className="continue-card panel">
      <div className="card-top"><span className="pill violet">IN PROGRESS</span><button aria-label="More options">•••</button></div>
      <div className="continue-content"><div><p className="muted">Advanced Product Design</p><h2>Designing for complex systems</h2><p className="lesson-meta">Lesson 4 · 38 minutes remaining</p><button className="dark-button"><span className="play"><Icon name="play"/></span>Continue learning</button></div><ProgressRing value={72}/></div>
      <div className="lesson-art" aria-hidden="true"><div className="art-grid"/><div className="art-orb one"/><div className="art-orb two"/><div className="art-card"><span>01</span><b>System</b><small>Design</small></div></div>
    </article>

    <article className="next-card panel">
      <div className="section-heading"><div><p className="eyebrow">UP NEXT</p><h2>Today&apos;s schedule</h2></div><a href="#">View calendar <Icon name="arrow"/></a></div>
      <div className="timeline">
        <div className="time active"><span>18:30</span><i/><div><small>LIVE SESSION · 60 MIN</small><strong>Research methods workshop</strong><p>Dr N. Mthembu · Studio 2</p></div><button>Join</button></div>
        <div className="time"><span>20:00</span><i/><div><small>SELF-PACED · 35 MIN</small><strong>Business writing practice</strong><p>Module 3 · Activity 2</p></div></div>
      </div>
    </article>

    <article className="progress-card panel">
      <div className="section-heading"><div><p className="eyebrow">THIS TERM</p><h2>Your progress</h2></div><a href="#">Details <Icon name="arrow"/></a></div>
      <div className="progress-figure"><strong>68%</strong><span>overall completion</span><div className="bar"><i style={{width:"68%"}}/></div><div className="axis"><small>Started 03 Jun</small><small>Ends 26 Sep</small></div></div>
      <dl className="metrics"><div><dt>18</dt><dd>Lessons complete</dd></div><div><dt>4</dt><dd>Assessments</dd></div><div><dt>87%</dt><dd>Average score</dd></div></dl>
    </article>

    <article className="deadline-card panel">
      <div className="deadline-icon">!</div><p className="eyebrow">DUE IN 2 DAYS</p><h2>Brand strategy case study</h2><p>Business Communication · Assignment 3</p><div className="deadline-footer"><span>Estimated effort: 2h 30m</span><a href="#">Open task <Icon name="arrow"/></a></div>
    </article>
  </section>;
}
