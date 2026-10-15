export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp';

const allowedAvatarTypes = new Set(PROFILE_AVATAR_ACCEPT.split(','));

export function validateProfileAvatar(file: File): string | null {
  if (!allowedAvatarTypes.has(file.type)) {
    return 'Выберите изображение JPEG, PNG или WebP.';
  }

  if (file.size > PROFILE_AVATAR_MAX_BYTES) {
    return 'Размер изображения не должен превышать 5 МБ.';
  }

  if (file.size === 0) return 'Выбранный файл пуст.';
  return null;
}
