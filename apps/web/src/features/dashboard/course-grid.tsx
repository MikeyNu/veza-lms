import { Icon } from "../../components/icon";
import { activeCourses } from "../../data/dashboard";

export function CourseGrid() {
  return <section className="courses-section">
    <div className="section-heading"><div><p className="eyebrow">ACTIVE LEARNING</p><h2>My courses</h2></div><a href="#">All courses <Icon name="arrow"/></a></div>
    <div className="course-grid">{activeCourses.map(course => <article className="course" key={course.title}>
      <div className={`course-art ${course.accent}`}><span>VEZA COURSE</span><div/><b>{course.title.split(" ").map(word => word[0]).join("")}</b></div>
      <div className="course-body"><p>{course.module}</p><h3>{course.title}</h3><div className="course-progress"><div className="bar"><i style={{width:`${course.progress}%`}}/></div><strong>{course.progress}%</strong></div><footer><span>{course.due}</span><button aria-label={`Open ${course.title}`}><Icon name="arrow"/></button></footer></div>
    </article>)}</div>
  </section>;
}
