import { PickType } from '@nestjs/mapped-types';
import { RegisterDto } from './register.dto';

export class ResendVerificationDto extends PickType(RegisterDto, ['email'] as const) {}
