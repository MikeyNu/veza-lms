export const primaryNavigation = [
  ["Overview", "home"],
  ["My learning", "book"],
  ["Courses", "grid"],
  ["Assessments", "check"],
  ["Calendar", "calendar"],
  ["Analytics", "chart"],
] as const;

export const activeCourses = [
  { title: "Advanced Product Design", module: "Module 6 of 8", progress: 72, accent: "violet", due: "Continue lesson" },
  { title: "Business Communication", module: "Module 3 of 7", progress: 43, accent: "teal", due: "Assignment due Friday" },
  { title: "Data Literacy Foundations", module: "Module 5 of 6", progress: 84, accent: "blue", due: "Quiz available" },
] as const;
