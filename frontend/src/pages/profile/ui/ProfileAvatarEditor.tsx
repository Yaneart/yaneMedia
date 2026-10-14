import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import { deleteProfileAvatar, updateProfileAvatar, type PrivateProfile } from '@/entities/profile';
import {
  invalidateAfterSocialMutation,
  synchronizeProfileAvatarCache,
} from '@/features/social-data';
import { Button, DeleteIcon } from '@/shared';
import { ApiClientError } from '@/shared/api';
import { useAuth } from '@/entities/auth';
import { PROFILE_AVATAR_ACCEPT, validateProfileAvatar } from '../model/profileAvatar';
import { getProfileInitial } from '../model/profilePresentation';

type ProfileAvatarEditorProps = {
  accountKey: string;
  profile: PrivateProfile;
};

function getAvatarError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 413) return 'Файл слишком большой. Максимальный размер — 5 МБ.';
    if (error.status === 415 || error.code === 'AVATAR_TYPE_UNSUPPORTED') {
      return 'Сервер не распознал изображение. Выберите корректный JPEG, PNG или WebP.';
    }
    if (error.status === 429) return 'Слишком много попыток. Подождите немного и попробуйте снова.';
    if (error.status >= 500) return 'Сервер не смог обработать изображение. Попробуйте позже.';
  }

  return 'Не удалось обновить аватар. Проверьте соединение и попробуйте снова.';
}

export function ProfileAvatarEditor({ accountKey, profile }: ProfileAvatarEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { refresh } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hasImageError, setHasImageError] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [action, setAction] = useState<'upload' | 'delete' | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const visibleUrl = previewUrl ?? profile.avatarUrl;

  useEffect(() => setHasImageError(false), [visibleUrl]);

  const applySavedProfile = (savedProfile: PrivateProfile) => {
    synchronizeProfileAvatarCache(queryClient, accountKey, savedProfile);
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = '';
    void invalidateAfterSocialMutation(queryClient, {
      type: 'profile',
      handles: [profile.handle, savedProfile.handle],
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const error = validateProfileAvatar(file);
    setMessage(error ? { tone: 'error', text: error } : null);
    setSelectedFile(error ? null : file);
    if (error) event.target.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFile || action) return;
    setAction('upload');
    setMessage(null);

    try {
      applySavedProfile(await updateProfileAvatar(selectedFile));
      setMessage({ tone: 'success', text: 'Аватар обновлён.' });
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 401) {
        await refresh();
        return;
      }
      setMessage({ tone: 'error', text: getAvatarError(error) });
    } finally {
      setAction(null);
    }
  };

  const handleDelete = async () => {
    if (action) return;
    setAction('delete');
    setMessage(null);

    try {
      applySavedProfile(await deleteProfileAvatar());
      setMessage({ tone: 'success', text: 'Аватар удалён.' });
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 401) {
        await refresh();
        return;
      }
      setMessage({ tone: 'error', text: getAvatarError(error) });
    } finally {
      setAction(null);
    }
  };

  const cancelSelection = () => {
    setSelectedFile(null);
    setMessage(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="w-full sm:w-52 sm:shrink-0">
      <div className="relative mx-auto size-32 sm:mx-0">
        {visibleUrl && !hasImageError ? (
          <img
            src={visibleUrl}
            alt={`Аватар ${profile.displayName}`}
            className="size-32 rounded-full bg-control object-cover"
            onError={() => {
              setHasImageError(true);
              if (previewUrl) {
                setMessage({
                  tone: 'error',
                  text: 'Не удалось открыть изображение. Выберите другой файл.',
                });
              }
            }}
          />
        ) : (
          <div
            role="img"
            aria-label={`Аватар ${profile.displayName}`}
            className="grid size-32 place-items-center rounded-full border border-context-border bg-watermark/10 text-4xl font-semibold text-accent-text"
          >
            {getProfileInitial(profile.displayName, profile.handle)}
          </div>
        )}
        {selectedFile && !hasImageError && (
          <span className="absolute right-0 bottom-1 rounded-pill bg-popover px-2 py-1 text-xs font-semibold text-text-primary shadow-overlay">
            Предпросмотр
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept={PROFILE_AVATAR_ACCEPT}
        tabIndex={-1}
        disabled={action !== null}
        onChange={handleFileChange}
      />

      <div className="mt-4 grid gap-2">
        <Button
          variant="secondary"
          size="small"
          disabled={action !== null}
          onClick={() => inputRef.current?.click()}
        >
          {selectedFile ? 'Выбрать другое' : profile.avatarUrl ? 'Заменить' : 'Выбрать изображение'}
        </Button>

        {selectedFile ? (
          <div className="grid grid-cols-2 gap-2">
            <Button size="small" disabled={action !== null || hasImageError} onClick={handleUpload}>
              {action === 'upload' ? 'Загрузка…' : 'Загрузить'}
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={action !== null}
              onClick={cancelSelection}
            >
              Отмена
            </Button>
          </div>
        ) : (
          profile.avatarUrl && (
            <Button variant="ghost" size="small" disabled={action !== null} onClick={handleDelete}>
              <DeleteIcon aria-hidden="true" className="size-4" />
              {action === 'delete' ? 'Удаляем…' : 'Удалить аватар'}
            </Button>
          )
        )}
      </div>

      <p className="mt-3 text-caption text-text-secondary">
        JPEG, PNG или WebP, не более 5 МБ. Изображение будет обрезано до квадрата.
      </p>
      <p
        role={message?.tone === 'error' ? 'alert' : 'status'}
        aria-live="polite"
        className={[
          'mt-2 min-h-5 text-caption',
          message?.tone === 'error' ? 'text-error' : 'text-success',
        ].join(' ')}
      >
        {message?.text}
      </p>
    </div>
  );
}
