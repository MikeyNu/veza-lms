import { Module } from "@nestjs/common";
import { LearnerCourseService } from "./application/learner-course.service.js";
import { LearnerCourseController } from "./http/learner-course.controller.js";

@Module({
  controllers: [LearnerCourseController],
  providers: [LearnerCourseService],
  exports: [LearnerCourseService],
})
export class LearnerCourseModule {}
