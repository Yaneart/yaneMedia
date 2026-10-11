import type { User } from '../../src/users/entities/user.entity';
import type { CreateUser, UsersRepository } from '../../src/users/users.repository';
import { UsersService } from '../../src/users/users.service';

describe('UsersService', () => {
  const user: User = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    handle: 'yaneart',
    displayName: 'Артём',
    bio: '',
    avatarAssetId: null,
    ratingsPublic: false,
    favoritesPublic: false,
    email: 'artem@example.com',
    passwordHash: 'test-password-hash',
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
    const findByHandle = jest.fn().mockResolvedValue(user) as jest.MockedFunction<
      UsersRepository['findByHandle']
    >;
    const repository = {
      create,
      findById,
      findByEmail,
      findByHandle,
    } as unknown as UsersRepository;

    return { repository, create, findById, findByEmail, findByHandle };
  };

  it('delegates user creation to the repository', async () => {
    const { repository, create } = createRepository();
    const service = new UsersService(repository);
    const data: CreateUser = {
      displayName: 'Артём',
      email: 'artem@example.com',
      passwordHash: user.passwordHash,
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

  it('delegates handle lookup to the repository', async () => {
    const { repository, findByHandle } = createRepository();
    const service = new UsersService(repository);

    await expect(service.findByHandle(user.handle)).resolves.toBe(user);
    expect(findByHandle).toHaveBeenCalledWith(user.handle);
  });
});
