import { Transform, type TransformFnParams } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";

export class RequeueDeadLetterDto {
  @Transform(({ value }: TransformFnParams) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value)
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  reason!: string;
}
