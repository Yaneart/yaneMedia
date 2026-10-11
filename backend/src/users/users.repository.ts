import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { type NewUser, type User, users } from './entities/user.entity';
import { createInitialHandle, normalizeHandle } from './handle';

export type CreateUser = Omit<NewUser, 'handle' | 'id'> & {
  handle?: string;
  id?: string;
};

@Injectable()
export class UsersRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(data: CreateUser): Promise<User> {
    const id = data.id ?? randomUUID();
    const [user] = await this.databaseService.db
      .insert(users)
      .values({
        ...data,
        id,
        handle: data.handle ? normalizeHandle(data.handle) : createInitialHandle(id),
        email: data.email.trim().toLowerCase(),
      })
      .returning();

    if (!user) {
      throw new Error('Не удалось создать пользователя');
    }

    return user;
  }

  async findById(id: string): Promise<User | undefined> {
    const [user] = await this.databaseService.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = email.trim().toLowerCase();

    const [user] = await this.databaseService.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1);

    return user;
  }

  async findByHandle(handle: string): Promise<User | undefined> {
    const normalizedHandle = normalizeHandle(handle);

    const [user] = await this.databaseService.db
      .select()
      .from(users)
      .where(sql`lower(${users.handle}) = ${normalizedHandle}`)
      .limit(1);

    return user;
  }
}
