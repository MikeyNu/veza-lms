import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class ResendAccessInvitationDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays = 7;

  @IsString()
  @MinLength(20)
  @MaxLength(500)
  reason!: string;
}

export class BulkRevokeAccessInvitationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  invitationIds!: string[];

  @IsString()
  @MinLength(20)
  @MaxLength(500)
  reason!: string;
}
