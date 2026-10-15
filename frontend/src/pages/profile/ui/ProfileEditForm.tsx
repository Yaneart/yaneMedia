import { useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent, type SubmitEvent } from 'react';

import { useAuth } from '@/entities/auth';
import {
  updateProfile,
  updateProfileSettings,
  type PrivateProfile,
  type ProfileSettings,
} from '@/entities/profile';
import { invalidateAfterSocialMutation, socialQueryKeys } from '@/features/social-data';
import { focusFirstInvalidField } from '@/features/auth-form';
import { Button, Input } from '@/shared';
import { ApiClientError } from '@/shared/api';
import { CheckIcon } from '@/shared/ui/Icons';
import {
  createProfileChanges,
  createProfileFormFields,
  normalizeProfileHandle,
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
  PROFILE_DISPLAY_NAME_MIN_LENGTH,
  PROFILE_HANDLE_MAX_LENGTH,
  validateProfileForm,
  type ProfileFormErrors,
  type ProfileFormFields,
  type ProfileTextField,
} from '../model/profileForm';

type ProfileEditFormProps = {
  accountKey: string;
  profile: PrivateProfile;
  settings: ProfileSettings;
};

function PrivacySwitch({
  name,
  checked,
  title,
  description,
  disabled,
  onChange,
}: {
  name: 'ratingsPublic' | 'favoritesPublic';
  checked: boolean;
  title: string;
  description: string;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-control border border-border bg-surface-elevated/55 p-3 transition-[background-color,border-color] hover:border-watermark/50 hover:bg-watermark/10 has-focus-visible:ring-2 has-focus-visible:ring-action/20 has-disabled:cursor-not-allowed has-disabled:opacity-60 motion-reduce:transition-none">
      <span>
        <span className="block text-sm font-semibold text-text-primary">{title}</span>
        <span className="mt-1 block text-caption text-text-secondary">{description}</span>
      </span>
      <span className="relative inline-grid size-6 shrink-0 place-items-center self-center">
        <input
          className="peer size-6 appearance-none rounded-full border border-border bg-control outline-none checked:border-action checked:bg-action"
          type="checkbox"
          role="switch"
          name={name}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
        />
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-action-text opacity-0 peer-checked:opacity-100">
          <CheckIcon aria-hidden="true" className="size-3.5" />
        </span>
      </span>
    </label>
  );
}

function hasKeys(value: object): boolean {
  return Object.keys(value).length > 0;
}

export function ProfileEditForm({ accountKey, profile, settings }: ProfileEditFormProps) {
  const queryClient = useQueryClient();
  const { state, setAuthenticated, refresh } = useAuth();
  const [fields, setFields] = useState<ProfileFormFields>(() =>
    createProfileFormFields(profile, settings),
  );
  const [formErrors, setFormErrors] = useState<ProfileFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateTextField = (field: ProfileTextField, value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
    setSubmitError(null);
    setSubmitSuccess(null);

    if (formErrors[field]) {
      setFormErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const form = event.currentTarget;
    const nextErrors = validateProfileForm(fields);
    setFormErrors(nextErrors);
    setSubmitError(null);
    setSubmitSuccess(null);

    const invalidFields = Object.keys(nextErrors);
    if (invalidFields.length > 0) {
      requestAnimationFrame(() => focusFirstInvalidField(form, invalidFields));
      return;
    }

    const changes = createProfileChanges(fields, profile, settings);
    const changesProfile = hasKeys(changes.profile);
    const changesSettings = hasKeys(changes.settings);
    if (!changesProfile && !changesSettings) {
      setSubmitSuccess('Изменений пока нет.');
      return;
    }

    setIsSubmitting(true);
    let savedProfile: PrivateProfile | null = null;
    let savedSettings: ProfileSettings | null = null;

    try {
      if (changesProfile) {
        savedProfile = await updateProfile(changes.profile);
        queryClient.setQueryData(socialQueryKeys.privateProfile(accountKey), savedProfile);

        if (state.status === 'authenticated') {
          setAuthenticated({ ...state.user, displayName: savedProfile.displayName });
        }
      }

      if (changesSettings) {
        savedSettings = await updateProfileSettings(changes.settings);
        queryClient.setQueryData(socialQueryKeys.profileSettings(accountKey), savedSettings);
      }

      const currentProfile = savedProfile ?? profile;
      const currentSettings = savedSettings ?? settings;
      setFields(createProfileFormFields(currentProfile, currentSettings));
      setSubmitSuccess('Настройки профиля сохранены.');

      await invalidateAfterSocialMutation(queryClient, {
        type: 'profile',
        handles: [profile.handle, currentProfile.handle],
      });
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 401) {
        await refresh();
        return;
      }

      if (error instanceof ApiClientError && error.code === 'HANDLE_TAKEN') {
        setFormErrors((current) => ({
          ...current,
          handle:
            error.fields.find(({ path }) => path === 'handle')?.message ??
            'Этот адрес профиля уже занят',
        }));
        requestAnimationFrame(() => focusFirstInvalidField(form, ['handle']));
      } else if (error instanceof ApiClientError && error.code === 'VALIDATION_FAILED') {
        const serverErrors = Object.fromEntries(
          error.fields
            .filter(({ path }) => ['displayName', 'handle', 'bio'].includes(path))
            .map(({ path, message }) => [path, message]),
        ) as ProfileFormErrors;
        setFormErrors(serverErrors);
        const invalidServerFields = Object.keys(serverErrors);
        if (invalidServerFields.length > 0) {
          requestAnimationFrame(() => focusFirstInvalidField(form, invalidServerFields));
        }
        setSubmitError(
          invalidServerFields.length > 0
            ? 'Сервер отклонил часть данных. Проверьте отмеченные поля.'
            : 'Сервер отклонил данные. Проверьте форму и попробуйте снова.',
        );
      } else if (error instanceof ApiClientError && error.status === 429) {
        setSubmitError('Слишком много попыток. Подождите немного и попробуйте снова.');
      } else {
        setSubmitError(
          savedProfile || savedSettings
            ? 'Часть изменений сохранена. Остальные значения оставлены в форме — попробуйте ещё раз.'
            : 'Не удалось сохранить настройки. Проверьте соединение и попробуйте снова.',
        );
      }

      if (savedProfile || savedSettings) {
        await invalidateAfterSocialMutation(queryClient, {
          type: 'profile',
          handles: [profile.handle, savedProfile?.handle ?? profile.handle],
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const normalizedHandle = normalizeProfileHandle(fields.handle);
  const handleWillChange = normalizedHandle.length > 0 && normalizedHandle !== profile.handle;

  return (
    <section
      aria-labelledby="profile-settings-heading"
      className="min-w-0 rounded-card border border-border bg-surface/40 p-3 sm:p-4 xl:p-5"
    >
      <div>
        <h2 id="profile-settings-heading" className="text-heading text-text-primary">
          Публичная информация
        </h2>
        <p className="mt-2 max-w-3xl text-body text-text-secondary">
          Эти данные видны на вашей публичной странице. Email и история просмотра всегда остаются
          приватными.
        </p>
      </div>

      <form className="mt-4 grid gap-3" noValidate onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Отображаемое имя"
            name="displayName"
            type="text"
            autoComplete="name"
            value={fields.displayName}
            maxLength={PROFILE_DISPLAY_NAME_MAX_LENGTH}
            error={formErrors.displayName}
            hint={`${PROFILE_DISPLAY_NAME_MIN_LENGTH}–${PROFILE_DISPLAY_NAME_MAX_LENGTH} символов`}
            reserveMessageSpace
            disabled={isSubmitting}
            onChange={(event) => updateTextField('displayName', event.target.value)}
          />
          <Input
            label="Адрес профиля"
            name="handle"
            type="text"
            autoComplete="username"
            value={fields.handle}
            maxLength={PROFILE_HANDLE_MAX_LENGTH}
            error={formErrors.handle}
            hint="Латинские буквы, цифры и _"
            reserveMessageSpace
            disabled={isSubmitting}
            onChange={(event) => updateTextField('handle', event.target.value)}
          />
        </div>

        {handleWillChange && (
          <p className="rounded-control border border-context-border bg-watermark/10 px-4 py-3 text-caption text-text-secondary">
            Новый публичный адрес:{' '}
            <strong className="text-text-primary">/u/{normalizedHandle}</strong>. Старый адрес
            перестанет открываться после сохранения.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="profile-bio" className="text-sm font-medium text-text-primary">
              Описание
            </label>
            <span className="text-caption tabular-nums text-text-secondary">
              {[...fields.bio].length}/{PROFILE_BIO_MAX_LENGTH}
            </span>
          </div>
          <textarea
            id="profile-bio"
            name="bio"
            rows={3}
            value={fields.bio}
            maxLength={PROFILE_BIO_MAX_LENGTH}
            placeholder="Расскажите немного о себе"
            disabled={isSubmitting}
            aria-invalid={formErrors.bio ? true : undefined}
            aria-describedby={formErrors.bio ? 'profile-bio-error' : 'profile-bio-hint'}
            className={[
              'w-full resize-y rounded-control border bg-control px-3 py-2.5 text-sm text-text-primary',
              'placeholder:text-text-secondary hover:bg-control-hover focus:bg-control-hover',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20',
              'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
              formErrors.bio ? 'border-error' : 'border-border hover:border-text-secondary',
            ].join(' ')}
            onChange={(event) => updateTextField('bio', event.target.value)}
          />
          <p
            id={formErrors.bio ? 'profile-bio-error' : 'profile-bio-hint'}
            className={[
              'min-h-5 text-caption',
              formErrors.bio ? 'text-error' : 'text-text-secondary',
            ].join(' ')}
          >
            {formErrors.bio ?? 'Обычный текст без разметки'}
          </p>
        </div>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-text-primary">Публичность коллекций</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <PrivacySwitch
              name="ratingsPublic"
              checked={fields.ratingsPublic}
              title="Показывать оценки"
              description="Другие пользователи смогут открыть список ваших оценок"
              disabled={isSubmitting}
              onChange={(event) => {
                setFields((current) => ({ ...current, ratingsPublic: event.target.checked }));
                setSubmitError(null);
                setSubmitSuccess(null);
              }}
            />
            <PrivacySwitch
              name="favoritesPublic"
              checked={fields.favoritesPublic}
              title="Показывать избранное"
              description="Другие пользователи смогут открыть ваше избранное"
              disabled={isSubmitting}
              onChange={(event) => {
                setFields((current) => ({ ...current, favoritesPublic: event.target.checked }));
                setSubmitError(null);
                setSubmitSuccess(null);
              }}
            />
          </div>
        </fieldset>

        <div className="flex flex-col-reverse gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p
            role={submitError ? 'alert' : 'status'}
            aria-live="polite"
            className={['min-h-5 text-caption', submitError ? 'text-error' : 'text-success'].join(
              ' ',
            )}
          >
            {submitError ?? submitSuccess}
          </p>
          <Button
            type="submit"
            size="small"
            disabled={isSubmitting}
            className="min-w-36 shadow-sm shadow-action/15 hover:shadow-md hover:shadow-watermark/25 hover:ring-2 hover:ring-watermark/40"
          >
            {!isSubmitting && <CheckIcon aria-hidden="true" className="size-4" />}
            {isSubmitting ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </section>
  );
}
