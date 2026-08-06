import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class BulkPersonStatusRecordDto {
  @IsUUID()
  personId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class BulkPersonStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((record: BulkPersonStatusRecordDto) => record.personId)
  @ValidateNested({ each: true })
  @Type(() => BulkPersonStatusRecordDto)
  records!: BulkPersonStatusRecordDto[];

  @IsIn(["active", "inactive"])
  status!: "active" | "inactive";

  @IsString()
  @MinLength(20)
  @MaxLength(500)
  reason!: string;
}
