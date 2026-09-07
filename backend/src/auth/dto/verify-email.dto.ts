import { IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @Length(43, 43)
  token!: string;
}
