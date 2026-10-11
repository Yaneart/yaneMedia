import { Injectable } from '@nestjs/common';
import { type CreateUser, UsersRepository } from './users.repository';
import type { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  create(data: CreateUser): Promise<User> {
    return this.usersRepository.create(data);
  }

  findById(id: string): Promise<User | undefined> {
    return this.usersRepository.findById(id);
  }

  findByEmail(email: string): Promise<User | undefined> {
    return this.usersRepository.findByEmail(email);
  }

  findByHandle(handle: string): Promise<User | undefined> {
    return this.usersRepository.findByHandle(handle);
  }
}
