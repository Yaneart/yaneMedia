import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { type NewUser, type User, users } from './entities/user.entity';

@Injectable()
export class UsersRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(data: NewUser): Promise<User> {
    const [user] = await this.databaseService.db
      .insert(users)
      .values({
        ...data,
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
}
