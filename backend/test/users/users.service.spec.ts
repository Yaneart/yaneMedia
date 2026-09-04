import type { NewUser, User } from '../../src/users/entities/user.entity';
import type { UsersRepository } from '../../src/users/users.repository';
import { UsersService } from '../../src/users/users.service';

describe('UsersService', () => {
  const user: User = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: 'Артём',
    email: 'artem@example.com',
    createdAt: new Date('2026-09-04T08:00:00.000Z'),
    updatedAt: new Date('2026-09-04T08:00:00.000Z'),
  };

  const createRepository = () => {
    const create = jest.fn().mockResolvedValue(user) as jest.MockedFunction<
      UsersRepository['create']
    >;
    const findById = jest.fn().mockResolvedValue(user) as jest.MockedFunction<
      UsersRepository['findById']
    >;
    const findByEmail = jest.fn().mockResolvedValue(user) as jest.MockedFunction<
      UsersRepository['findByEmail']
    >;
    const repository = { create, findById, findByEmail } as unknown as UsersRepository;

    return { repository, create, findById, findByEmail };
  };

  it('delegates user creation to the repository', async () => {
    const { repository, create } = createRepository();
    const service = new UsersService(repository);
    const data: NewUser = {
      displayName: 'Артём',
      email: 'artem@example.com',
    };

    await expect(service.create(data)).resolves.toBe(user);
    expect(create).toHaveBeenCalledWith(data);
  });

  it('delegates UUID lookup to the repository', async () => {
    const { repository, findById } = createRepository();
    const service = new UsersService(repository);

    await expect(service.findById(user.id)).resolves.toBe(user);
    expect(findById).toHaveBeenCalledWith(user.id);
  });

  it('delegates email lookup to the repository', async () => {
    const { repository, findByEmail } = createRepository();
    const service = new UsersService(repository);

    await expect(service.findByEmail(user.email)).resolves.toBe(user);
    expect(findByEmail).toHaveBeenCalledWith(user.email);
  });
});
