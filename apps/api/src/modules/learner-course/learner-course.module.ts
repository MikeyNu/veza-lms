import { Module } from "@nestjs/common";
import { LearnerCalendarService } from "./application/learner-calendar.service.js";
import { LearnerCourseService } from "./application/learner-course.service.js";
import { LearnerCalendarController } from "./http/learner-calendar.controller.js";
import { LearnerCourseController } from "./http/learner-course.controller.js";

@Module({
  controllers: [LearnerCourseController, LearnerCalendarController],
  providers: [LearnerCourseService, LearnerCalendarService],
  exports: [LearnerCourseService, LearnerCalendarService],
})
export class LearnerCourseModule {}
