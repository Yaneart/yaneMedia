import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { EmailDto } from './email.dto';

export class RegisterDto extends EmailDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 50)
  displayName!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}
