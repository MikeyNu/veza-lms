import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class SearchQueryDto {
  @IsString()
  @MaxLength(500)
  query!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string"
      ? value.split(",").map((item) => item.trim()).filter(Boolean)
      : value,
  )
  @IsArray()
  @IsString({ each: true })
  entityTypes?: string[];

  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
