import Link from "next/link";
import { Icon } from "../../components/icon";
import { activeCourses } from "../../data/dashboard";

export function CourseGrid() {
  return (
    <section className="courses-section">
      <div className="section-heading">
        <div><p className="eyebrow">Active learning</p><h2>My courses</h2></div>
        <Link href="/learning">All courses <Icon name="arrow" /></Link>
      </div>
      <div className="course-grid">
        {activeCourses.map((course) => (
          <Link className="course" href={course.href} key={course.title}>
            <div className={`course-art ${course.tone}`}>
              <span>Veza course</span>
              <b>{course.title.split(" ").map((word) => word[0]).join("")}</b>
              <small>{course.progress}% complete</small>
            </div>
            <div className="course-body">
              <p>{course.module}</p>
              <h3>{course.title}</h3>
              <div className="course-progress">
                <div className="bar"><i style={{ width: `${course.progress}%` }} /></div>
                <strong>{course.progress}%</strong>
              </div>
              <footer><span>{course.due}</span><span className="course-open" aria-hidden="true"><Icon name="arrow" /></span></footer>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
