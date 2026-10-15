import { useMutation } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';

import { moderateContent, type ReportTarget } from '@/entities/moderation';
import { describeSocialAccessError } from '@/features/social-access';
import { Button } from '@/shared';
import {
  normalizeModerationDecision,
  validateModerationDecision,
} from '../model/contentModeration';

type ContentModerationFormProps = {
  target: ReportTarget;
  onCancel: () => void;
  onSuccess: () => void;
};

export function ContentModerationForm({ target, onCancel, onSuccess }: ContentModerationFormProps) {
  const id = useId();
  const [decision, setDecision] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      moderateContent({ target, action: 'hide', decision: normalizeModerationDecision(decision) }),
    onSuccess,
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextError = validateModerationDecision(decision);
    setValidationError(nextError);
    if (!nextError && !mutation.isPending) mutation.mutate();
  };

  return (
    <form
      onSubmit={submit}
      className="w-full rounded-control border border-error/30 bg-error/5 p-4"
    >
      <label htmlFor={`${id}-decision`} className="text-sm font-semibold text-text-primary">
        Служебное основание скрытия
      </label>
      <p className="mt-1 text-caption text-text-secondary">
        Оно попадёт только в журнал модерации и не будет показано автору.
      </p>
      <textarea
        id={`${id}-decision`}
        autoFocus
        rows={3}
        maxLength={1000}
        value={decision}
        disabled={mutation.isPending}
        onChange={(event) => {
          setDecision(event.target.value);
          setValidationError(null);
          mutation.reset();
        }}
        className="mt-3 w-full resize-y rounded-control border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
      />
      <p className="mt-1 text-right text-caption text-text-secondary">
        {Array.from(decision).length}/1000
      </p>
      {(validationError || mutation.isError) && (
        <p role="alert" className="mt-2 text-sm text-error">
          {validationError ??
            describeSocialAccessError(
              mutation.error,
              'Не удалось скрыть материал. Попробуйте снова.',
            ).message}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="submit"
          size="small"
          className="bg-error text-white"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Скрываем…' : 'Скрыть материал'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="small"
          disabled={mutation.isPending}
          onClick={onCancel}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
