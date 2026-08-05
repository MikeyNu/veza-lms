export const primaryNavigation = [
  ["Overview", "home"],
  ["My learning", "book"],
  ["Courses", "grid"],
  ["Assessments", "check"],
  ["Calendar", "calendar"],
  ["Analytics", "chart"],
] as const;

export const activeCourses = [
  { title: "Advanced Product Design", module: "Module 6 of 8", progress: 72, tone: "course-art-deep", due: "Continue lesson", href: "/learning" },
  { title: "Business Communication", module: "Module 3 of 7", progress: 43, tone: "course-art-teal", due: "Assignment due Friday", href: "/assessments" },
  { title: "Data Literacy Foundations", module: "Module 5 of 6", progress: 84, tone: "course-art-mist", due: "Quiz available", href: "/learning" },
] as const;
