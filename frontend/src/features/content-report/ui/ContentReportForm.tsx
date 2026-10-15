import { useMutation } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';

import { createReport, type ReportReason, type ReportTarget } from '@/entities/moderation';
import { describeSocialAccessError } from '@/features/social-access';
import { Button } from '@/shared';
import { ApiClientError } from '@/shared/api';
import { normalizeReportNote, reportReasons, validateReportNote } from '../model/contentReport';

type ContentReportFormProps = {
  target: ReportTarget;
  onCancel: () => void;
  onUnauthorized: () => void;
};

export function ContentReportForm({ target, onCancel, onUnauthorized }: ContentReportFormProps) {
  const id = useId();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => createReport(target, reason, normalizeReportNote(note) || undefined),
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 401) onUnauthorized();
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextError = validateReportNote(reason, note);
    setValidationError(nextError);
    if (!nextError && !mutation.isPending) mutation.mutate();
  };

  if (mutation.isSuccess) {
    return (
      <p
        role="status"
        className="rounded-control bg-success/10 px-4 py-3 text-sm font-medium text-success"
      >
        Жалоба отправлена на рассмотрение.
      </p>
    );
  }

  const errorMessage = mutation.isError
    ? mutation.error instanceof ApiClientError && mutation.error.code === 'REPORT_ALREADY_EXISTS'
      ? 'Вы уже отправили активную жалобу на этот материал.'
      : describeSocialAccessError(mutation.error, 'Не удалось отправить жалобу. Попробуйте снова.')
          .message
    : null;

  return (
    <form onSubmit={submit} className="w-full rounded-control border border-border bg-control p-4">
      <label htmlFor={`${id}-reason`} className="text-sm font-semibold text-text-primary">
        Причина жалобы
      </label>
      <select
        id={`${id}-reason`}
        autoFocus
        value={reason}
        disabled={mutation.isPending}
        onChange={(event) => {
          setReason(event.target.value as ReportReason);
          setValidationError(null);
          mutation.reset();
        }}
        className="mt-2 min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
      >
        {reportReasons.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-note`} className="mt-4 block text-sm font-semibold text-text-primary">
        Пояснение {reason === 'other' ? '(обязательно)' : '(необязательно)'}
      </label>
      <textarea
        id={`${id}-note`}
        value={note}
        rows={4}
        maxLength={1000}
        disabled={mutation.isPending}
        onChange={(event) => {
          setNote(event.target.value);
          setValidationError(null);
          mutation.reset();
        }}
        className="mt-2 w-full resize-y rounded-control border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
      />
      <p className="mt-1 text-right text-caption text-text-secondary">
        {Array.from(note).length}/1000
      </p>
      {(validationError || errorMessage) && (
        <p role="alert" className="mt-2 text-sm text-error">
          {validationError ?? errorMessage}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" size="small" disabled={mutation.isPending}>
          {mutation.isPending ? 'Отправляем…' : 'Отправить жалобу'}
        </Button>
        <Button
          type="button"
          variant="ghost"
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
