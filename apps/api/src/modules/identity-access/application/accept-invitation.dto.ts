import { IsString, IsUUID, MinLength } from "class-validator";

export class AcceptInvitationDto {
  @IsUUID()
  invitationId!: string;

  @IsString()
  @MinLength(32)
  token!: string;
}
