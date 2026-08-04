import { IsEmail, IsInt, IsOptional, Max, Min } from "class-validator";

export class InviteTenantOwnerDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays = 7;
}
