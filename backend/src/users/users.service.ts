import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import type { NewUser, User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  create(data: NewUser): Promise<User> {
    return this.usersRepository.create(data);
  }

  findById(id: string): Promise<User | undefined> {
    return this.usersRepository.findById(id);
  }

  findByEmail(email: string): Promise<User | undefined> {
    return this.usersRepository.findByEmail(email);
  }
}
