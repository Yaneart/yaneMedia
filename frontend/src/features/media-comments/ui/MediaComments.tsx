import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { createPublicProfilePath } from '@/app/router/routes';
import { useAuth } from '@/entities/auth';
import {
  createMediaComment,
  deleteMediaComment,
  updateMediaComment,
  type MediaComment,
  type MediaCommentPage,
} from '@/entities/media-comment';
import type { MediaSummary } from '@/entities/media';
import type { ReviewAuthor } from '@/entities/review';
import { ContentModerationForm } from '@/features/content-moderation';
import { ContentReportForm } from '@/features/content-report';
import {
  mediaCommentsQueryOptions,
  privateProfileQueryOptions,
  socialQueryKeys,
  type SocialViewer,
} from '@/features/social-data';
import {
  describeSocialAccessError,
  SocialLoginLink,
  useRestoreSocialAction,
} from '@/features/social-access';
import { Button, LoadMoreButton, ProfileIcon, Skeleton } from '@/shared';
import { ApiClientError } from '@/shared/api';
import {
  appendMediaComment,
  mediaCommentBodyLimit,
  mergeMediaComments,
  normalizeMediaCommentBody,
  removeMediaComment,
  replaceMediaComment,
  validateMediaCommentBody,
  wasMediaCommentEdited,
} from '../model/mediaComments';

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Дата не указана' : dateFormatter.format(date);
}

function mutationMessage(error: unknown, action: 'create' | 'update' | 'delete'): string {
  if (error instanceof ApiClientError && error.code === 'EDIT_CONFLICT') {
    return 'Комментарий уже изменился. Скопируйте текст, обновите страницу и повторите.';
  }
  if (error instanceof ApiClientError && error.code === 'COMMENT_NOT_FOUND') {
    return 'Комментарий больше недоступен.';
  }
  const fallback =
    action === 'create'
      ? 'Не удалось отправить комментарий. Текст сохранён в форме.'
      : action === 'update'
        ? 'Не удалось сохранить изменения.'
        : 'Не удалось удалить комментарий.';
  return describeSocialAccessError(error, fallback).message;
}

function Author({ author }: { author: ReviewAuthor }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarUrl = author.state === 'active' ? author.user.avatarUrl : null;
  useEffect(() => setAvatarFailed(false), [avatarUrl]);

  const avatar =
    avatarUrl && !avatarFailed ? (
      <img
        src={avatarUrl}
        alt=""
        className="size-9 rounded-full bg-control object-cover"
        onError={() => setAvatarFailed(true)}
      />
    ) : (
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-watermark/10 text-xs font-semibold text-accent-text">
        {author.state === 'active' ? (
          (Array.from(author.user.displayName.trim() || author.user.handle)[0]?.toUpperCase() ??
          '?')
        ) : (
          <ProfileIcon className="size-4 text-text-secondary" aria-hidden="true" />
        )}
      </span>
    );

  if (author.state === 'deleted') {
    return (
      <span className="inline-flex min-w-0 items-center gap-2.5">
        {avatar}
        <span className="truncate text-sm font-semibold text-text-primary">{author.label}</span>
      </span>
    );
  }

  return (
    <Link
      to={createPublicProfilePath(author.user.handle)}
      className="inline-flex min-w-0 items-center gap-2.5 rounded-control outline-none hover:text-accent-text focus-visible:ring-2 focus-visible:ring-action/20"
    >
      {avatar}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-text-primary hover:underline">
          {author.user.displayName}
        </span>
        <span className="block truncate text-caption text-text-secondary">
          @{author.user.handle}
        </span>
      </span>
    </Link>
  );
}

function CommentForm({
  label,
  initialBody = '',
  pending,
  error,
  compact = false,
  onCancel,
  onSubmit,
}: {
  label: string;
  initialBody?: string;
  pending: boolean;
  error: unknown;
  compact?: boolean;
  onCancel?: () => void;
  onSubmit: (body: string) => void;
}) {
  const fieldId = useId();
  const [body, setBody] = useState(initialBody);
  const [validationError, setValidationError] = useState<string | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextError = validateMediaCommentBody(body);
    setValidationError(nextError);
    if (!nextError && !pending) onSubmit(normalizeMediaCommentBody(body));
  };

  return (
    <form onSubmit={submit} className={compact ? 'mt-4' : ''}>
      <label htmlFor={fieldId} className="text-sm font-semibold text-text-primary">
        {label}
      </label>
      <textarea
        id={fieldId}
        autoFocus={compact}
        rows={compact ? 3 : 4}
        value={body}
        placeholder="Поделитесь мнением…"
        onChange={(event) => {
          setBody(event.target.value);
          setValidationError(null);
        }}
        className="mt-2 w-full resize-y rounded-control border border-border bg-elevated px-3 py-2 text-sm leading-relaxed text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-text-secondary">
          {Array.from(body).length}/{mediaCommentBodyLimit}
        </span>
        <div className="flex gap-2">
          <Button type="submit" size="small" disabled={pending}>
            {pending ? 'Отправляем…' : compact ? 'Отправить' : 'Опубликовать'}
          </Button>
          {onCancel && (
            <Button variant="ghost" size="small" disabled={pending} onClick={onCancel}>
              Отмена
            </Button>
          )}
        </div>
      </div>
      {(validationError !== null || Boolean(error)) && (
        <p role="alert" className="mt-2 text-sm text-error">
          {validationError ?? mutationMessage(error, initialBody ? 'update' : 'create')}
        </p>
      )}
    </form>
  );
}

function CommentCard({
  comment,
  mediaRef,
  isReply,
  onChanged,
  onRemoved,
  onCreated,
  onUnauthorized,
}: {
  comment: MediaComment;
  mediaRef: string;
  isReply: boolean;
  onChanged: (comment: MediaComment) => void;
  onRemoved: (comment: MediaComment) => void;
  onCreated: (comment: MediaComment) => void;
  onUnauthorized: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [moderating, setModerating] = useState(false);
  const updateMutation = useMutation({
    mutationFn: (body: string) => updateMediaComment(comment.commentId, body, comment.updatedAt),
    onSuccess: (updated) => {
      onChanged(updated);
      setEditing(false);
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 401) onUnauthorized();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteMediaComment(comment.commentId),
    onSuccess: () => onRemoved(comment),
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 401) onUnauthorized();
    },
  });
  const replyMutation = useMutation({
    mutationFn: (body: string) => createMediaComment(mediaRef, body, comment.commentId),
    onSuccess: (created) => {
      onCreated(created);
      setReplying(false);
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 401) onUnauthorized();
    },
  });

  return (
    <article
      id={`media-comment-${comment.commentId}`}
      tabIndex={-1}
      className={
        isReply
          ? 'rounded-control border border-border/80 bg-elevated p-4 outline-none focus-visible:ring-2 focus-visible:ring-action/20'
          : 'rounded-card border border-border bg-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-action/20 sm:p-5'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Author author={comment.author} />
        <div className="flex flex-wrap justify-end gap-1">
          {comment.viewerActions.canReply && (
            <Button variant="ghost" size="small" onClick={() => setReplying((value) => !value)}>
              Ответить
            </Button>
          )}
          {comment.viewerActions.canEdit && (
            <Button variant="ghost" size="small" onClick={() => setEditing(true)}>
              Изменить
            </Button>
          )}
          {comment.viewerActions.canDelete && (
            <Button
              variant="ghost"
              size="small"
              className="text-error"
              onClick={() => setConfirmingDelete(true)}
            >
              Удалить
            </Button>
          )}
          {comment.viewerActions.canReport && (
            <Button variant="ghost" size="small" onClick={() => setReporting(true)}>
              Пожаловаться
            </Button>
          )}
          {comment.viewerActions.canModerate && (
            <Button
              variant="ghost"
              size="small"
              className="text-error"
              onClick={() => setModerating(true)}
            >
              Скрыть
            </Button>
          )}
        </div>
      </div>

      {comment.deleted ? (
        <p className="mt-4 text-sm italic text-text-secondary">
          Текст удалён автором. Ответы в ветке сохранены.
        </p>
      ) : editing ? (
        <CommentForm
          label="Текст комментария"
          initialBody={comment.body}
          pending={updateMutation.isPending}
          error={updateMutation.error}
          onCancel={() => setEditing(false)}
          onSubmit={(body) => updateMutation.mutate(body)}
        />
      ) : (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-text-primary sm:text-base">
          {comment.body}
        </p>
      )}

      <p className="mt-3 text-caption text-text-secondary">
        <time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
        {wasMediaCommentEdited(comment) && <span> · изменено</span>}
      </p>

      {replying && (
        <CommentForm
          label={`Ответ для ${comment.author.state === 'active' ? comment.author.user.displayName : 'участника'}`}
          compact
          pending={replyMutation.isPending}
          error={replyMutation.error}
          onCancel={() => setReplying(false)}
          onSubmit={(body) => replyMutation.mutate(body)}
        />
      )}

      {reporting && (
        <div className="mt-4 max-w-xl">
          <ContentReportForm
            target={{ type: 'comment', commentId: comment.commentId }}
            onCancel={() => setReporting(false)}
            onUnauthorized={onUnauthorized}
          />
        </div>
      )}

      {moderating && (
        <div className="mt-4 max-w-xl">
          <ContentModerationForm
            target={{ type: 'comment', commentId: comment.commentId }}
            onCancel={() => setModerating(false)}
            onSuccess={() => onRemoved(comment)}
          />
        </div>
      )}

      {confirmingDelete && (
        <div
          role="alertdialog"
          aria-label="Удалить комментарий?"
          className="mt-4 rounded-control border border-error/40 bg-error/5 p-4"
        >
          <p className="font-semibold text-text-primary">Удалить комментарий?</p>
          {deleteMutation.isError && (
            <p role="alert" className="mt-2 text-sm text-error">
              {mutationMessage(deleteMutation.error, 'delete')}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              size="small"
              className="bg-error text-white"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? 'Удаляем…' : 'Удалить'}
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={deleteMutation.isPending}
              onClick={() => setConfirmingDelete(false)}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

export function MediaComments({ media }: { media: MediaSummary }) {
  const composerId = useId();
  const { state: authState, setGuest, refresh } = useAuth();
  const queryClient = useQueryClient();
  const composerRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const viewer: SocialViewer =
    authState.status === 'authenticated' ? { accountKey: authState.user.email } : 'guest';
  const viewerReady = authState.status !== 'loading';
  const queryOptions = mediaCommentsQueryOptions(media.mediaRef, viewer);
  const query = useInfiniteQuery({ ...queryOptions, enabled: viewerReady });
  const profileQuery = useQuery({
    ...privateProfileQueryOptions(
      authState.status === 'authenticated' ? authState.user.email : 'inactive',
    ),
    enabled: authState.status === 'authenticated',
  });
  const comments = mergeMediaComments(query.data?.pages ?? []);
  const byId = new Map(comments.map((comment) => [comment.commentId, comment]));
  const roots = comments.filter(
    (comment) => comment.parentCommentId === null || !byId.has(comment.parentCommentId),
  );
  const repliesByRoot = new Map<string, MediaComment[]>();
  for (const comment of comments) {
    if (!comment.parentCommentId || !byId.has(comment.parentCommentId)) continue;
    const replies = repliesByRoot.get(comment.parentCommentId) ?? [];
    replies.push(comment);
    repliesByRoot.set(comment.parentCommentId, replies);
  }

  useRestoreSocialAction(
    'comment',
    () => composerRef.current?.querySelector('textarea')?.focus(),
    authState.status === 'authenticated' && profileQuery.data?.emailVerified === true,
  );

  const patchPages = (patch: (pages: readonly MediaCommentPage[]) => MediaCommentPage[]) => {
    queryClient.setQueryData<InfiniteData<MediaCommentPage>>(queryOptions.queryKey, (current) =>
      current ? { ...current, pages: patch(current.pages) } : current,
    );
  };
  const markProfilesStale = (comment: MediaComment) => {
    if (comment.author.state === 'active') {
      void queryClient.invalidateQueries({
        queryKey: socialQueryKeys.publicProfile(comment.author.user.handle),
        refetchType: 'none',
      });
    }
    if (authState.status === 'authenticated') {
      void queryClient.invalidateQueries({
        queryKey: socialQueryKeys.privateProfile(authState.user.email),
        refetchType: 'none',
      });
    }
  };
  const append = (comment: MediaComment) => {
    patchPages((pages) => appendMediaComment(pages, comment));
    markProfilesStale(comment);
  };
  const changed = (comment: MediaComment) =>
    patchPages((pages) => replaceMediaComment(pages, comment));
  const removed = (comment: MediaComment) => {
    const hasReplies = comments.some((item) => item.parentCommentId === comment.commentId);
    patchPages((pages) =>
      hasReplies && comment.parentCommentId === null
        ? replaceMediaComment(pages, {
            ...comment,
            deleted: true,
            author: { state: 'deleted', label: 'Удалённый пользователь' },
            body: '',
            viewerActions: {
              canEdit: false,
              canDelete: false,
              canReply: false,
              canReport: false,
              canModerate: false,
            },
          })
        : removeMediaComment(pages, comment.commentId),
    );
    markProfilesStale(comment);
  };
  const createMutation = useMutation({
    mutationFn: (commentBody: string) => createMediaComment(media.mediaRef, commentBody),
    onSuccess: (comment) => {
      append(comment);
      setBody('');
      setValidationError(null);
      requestAnimationFrame(() =>
        document.getElementById(`media-comment-${comment.commentId}`)?.focus(),
      );
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 401) setGuest();
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextError = validateMediaCommentBody(body);
    setValidationError(nextError);
    if (!nextError && !createMutation.isPending) {
      createMutation.mutate(normalizeMediaCommentBody(body));
    }
  };

  return (
    <div className="rounded-card border border-context-border bg-surface p-5 sm:p-6">
      <div>
        <p className="text-caption font-semibold tracking-wider text-accent-text uppercase">
          Обсуждение произведения
        </p>
        <h2 className="mt-1 text-heading text-text-primary">Комментарии</h2>
      </div>

      <div ref={composerRef} className="mt-5">
        {authState.status === 'authenticated' && profileQuery.data?.emailVerified ? (
          <form
            onSubmit={submit}
            className="rounded-control border border-border bg-control/40 p-4"
          >
            <label htmlFor={composerId} className="font-semibold text-text-primary">
              Добавить комментарий
            </label>
            <textarea
              id={composerId}
              rows={4}
              value={body}
              placeholder="Что вы думаете об этом произведении?"
              onChange={(event) => {
                setBody(event.target.value);
                setValidationError(null);
                createMutation.reset();
              }}
              className="mt-3 w-full resize-y rounded-control border border-border bg-elevated px-3 py-2 text-sm leading-relaxed text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <span className="text-caption text-text-secondary">
                {Array.from(body).length}/{mediaCommentBodyLimit}
              </span>
              <Button type="submit" size="small" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Отправляем…' : 'Опубликовать'}
              </Button>
            </div>
            {(validationError || createMutation.isError) && (
              <p role="alert" className="mt-2 text-sm text-error">
                {validationError ?? mutationMessage(createMutation.error, 'create')}
              </p>
            )}
          </form>
        ) : authState.status === 'guest' ? (
          <p className="rounded-control border border-border bg-control/40 px-4 py-3 text-sm text-text-secondary">
            <SocialLoginLink intent="comment" className="font-semibold text-action hover:underline">
              Войдите
            </SocialLoginLink>{' '}
            с возвратом к произведению, чтобы писать комментарии.
          </p>
        ) : authState.status === 'error' ? (
          <div className="flex flex-wrap items-center gap-3 rounded-control border border-border p-4">
            <p role="alert" className="text-sm text-error">
              Не удалось проверить сессию.
            </p>
            <Button variant="secondary" size="small" onClick={() => void refresh()}>
              Повторить
            </Button>
          </div>
        ) : profileQuery.isError ? (
          <div className="flex flex-wrap items-center gap-3 rounded-control border border-border p-4">
            <p role="alert" className="text-sm text-error">
              Не удалось проверить доступ.
            </p>
            <Button variant="secondary" size="small" onClick={() => void profileQuery.refetch()}>
              Повторить
            </Button>
          </div>
        ) : authState.status === 'authenticated' && profileQuery.data?.emailVerified === false ? (
          <p className="rounded-control border border-border bg-control/40 px-4 py-3 text-sm text-text-secondary">
            Подтвердите email, чтобы участвовать в обсуждении.
          </p>
        ) : null}
      </div>

      <div className="mt-6" aria-live="polite">
        {!viewerReady || query.isPending ? (
          <div aria-label="Загружаем комментарии" className="space-y-3">
            <Skeleton className="h-36 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
          </div>
        ) : query.isError && comments.length === 0 ? (
          <div className="rounded-control border border-error/30 bg-error/5 p-4">
            <p className="font-semibold text-text-primary">Не удалось загрузить комментарии</p>
            <p className="mt-1 text-sm text-text-secondary">
              Сведения о произведении и плеер продолжают работать.
            </p>
            <Button
              className="mt-3"
              variant="secondary"
              size="small"
              onClick={() => void query.refetch()}
            >
              Попробовать снова
            </Button>
          </div>
        ) : roots.length === 0 ? (
          <p className="rounded-control border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
            Здесь пока тихо. Начните обсуждение произведения.
          </p>
        ) : (
          <div className="space-y-4">
            {roots.map((root) => (
              <div key={root.commentId}>
                <CommentCard
                  comment={root}
                  mediaRef={media.mediaRef}
                  isReply={false}
                  onChanged={changed}
                  onRemoved={removed}
                  onCreated={append}
                  onUnauthorized={setGuest}
                />
                {(repliesByRoot.get(root.commentId)?.length ?? 0) > 0 && (
                  <div className="mt-2 ml-4 space-y-2 border-l-2 border-action/20 pl-3 sm:ml-8 sm:pl-5">
                    {repliesByRoot.get(root.commentId)?.map((reply) => (
                      <CommentCard
                        key={reply.commentId}
                        comment={reply}
                        mediaRef={media.mediaRef}
                        isReply
                        onChanged={changed}
                        onRemoved={removed}
                        onCreated={append}
                        onUnauthorized={setGuest}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {query.hasNextPage && (
          <div className="mt-5 flex justify-center">
            <LoadMoreButton
              isLoading={query.isFetchingNextPage}
              hasError={query.isFetchNextPageError}
              onClick={() => void query.fetchNextPage({ cancelRefetch: false })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
