import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Link } from 'react-router';

import { createPublicProfilePath } from '@/app/router/routes';
import { useAuth } from '@/entities/auth';
import type { ReviewAuthor, ReviewDetail } from '@/entities/review';
import {
  createReviewComment,
  deleteReviewComment,
  updateReviewComment,
  type ReviewComment,
  type ReviewCommentPage,
} from '@/entities/review-comment';
import { ContentReportForm } from '@/features/content-report';
import { ContentModerationForm } from '@/features/content-moderation';
import {
  privateProfileQueryOptions,
  reviewCommentsQueryOptions,
  socialQueryKeys,
  type SocialViewer,
} from '@/features/social-data';
import {
  describeSocialAccessError,
  SocialLoginLink,
  useRestoreSocialAction,
} from '@/features/social-access';
import { Button, DeleteIcon, LoadMoreButton, MoreIcon, ProfileIcon, ShieldIcon } from '@/shared';
import { ApiClientError } from '@/shared/api';
import {
  appendReviewComment,
  commentBodyLimit,
  mergeReviewComments,
  normalizeCommentBody,
  removeReviewComment,
  replaceReviewComment,
  validateCommentBody,
  wasCommentEdited,
} from '../model/reviewDiscussion';

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

type DiscussionProps = { review: ReviewDetail };

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Дата не указана' : dateFormatter.format(date);
}

function mutationMessage(error: unknown, action: 'create' | 'update' | 'delete'): string {
  if (error instanceof ApiClientError && error.code === 'EDIT_CONFLICT') {
    return 'Комментарий уже изменился. Скопируйте текст, обновите страницу и повторите попытку.';
  }
  if (error instanceof ApiClientError && error.code === 'REVIEW_NOT_FOUND') {
    return 'Рецензия больше недоступна. Текст комментария сохранён в форме.';
  }
  if (error instanceof ApiClientError && error.code === 'COMMENT_NOT_FOUND') {
    return 'Комментарий больше недоступен.';
  }
  const fallback =
    action === 'create'
      ? 'Не удалось отправить комментарий. Текст сохранён — попробуйте снова.'
      : action === 'update'
        ? 'Не удалось сохранить изменения. Текст сохранён — попробуйте снова.'
        : 'Не удалось удалить комментарий. Попробуйте снова.';
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

function CommentEditor({
  initialBody,
  isPending,
  error,
  onCancel,
  onSubmit,
}: {
  initialBody: string;
  isPending: boolean;
  error: unknown;
  onCancel: () => void;
  onSubmit: (body: string) => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [validationError, setValidationError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextError = validateCommentBody(body);
    setValidationError(nextError);
    if (!nextError) onSubmit(normalizeCommentBody(body));
  };

  return (
    <form onSubmit={submit} className="mt-4">
      <label htmlFor="comment-edit-body" className="sr-only">
        Текст комментария
      </label>
      <textarea
        id="comment-edit-body"
        autoFocus
        rows={5}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          setValidationError(null);
        }}
        className="w-full resize-y rounded-control border border-border bg-elevated px-3 py-2 text-sm leading-relaxed text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-text-secondary">
          {Array.from(body).length}/{commentBodyLimit}
        </span>
        <div className="flex gap-2">
          <Button type="submit" size="small" disabled={isPending}>
            {isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          <Button variant="ghost" size="small" disabled={isPending} onClick={onCancel}>
            Отмена
          </Button>
        </div>
      </div>
      {(validationError !== null || Boolean(error)) && (
        <p role="alert" className="mt-2 text-sm text-error">
          {validationError ?? mutationMessage(error, 'update')}
        </p>
      )}
    </form>
  );
}

function CommentItem({
  comment,
  isNew,
  onUpdated,
  onDeleted,
  onUnauthorized,
}: {
  comment: ReviewComment;
  isNew: boolean;
  onUpdated: (comment: ReviewComment) => void;
  onDeleted: (commentId: string) => void;
  onUnauthorized: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteConfirmRef = useRef<HTMLDivElement>(null);
  const updateMutation = useMutation({
    mutationFn: (body: string) => updateReviewComment(comment.commentId, body, comment.updatedAt),
    onSuccess: (updated) => {
      onUpdated(updated);
      setEditing(false);
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 401) onUnauthorized();
      if (error instanceof ApiClientError && error.code === 'COMMENT_NOT_FOUND') {
        onDeleted(comment.commentId);
      }
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteReviewComment(comment.commentId),
    onSuccess: () => onDeleted(comment.commentId),
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 401) onUnauthorized();
      if (error instanceof ApiClientError && error.code === 'COMMENT_NOT_FOUND') {
        onDeleted(comment.commentId);
      }
    },
  });

  const closeMenu = () => {
    setMenuOpen(false);
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  };
  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (currentIndex + 1) % items.length
            : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };
  useEffect(() => {
    if (confirmingDelete) deleteConfirmRef.current?.focus();
  }, [confirmingDelete]);
  const cancelDelete = () => {
    setConfirmingDelete(false);
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  };

  const openMenuFromKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMenuOpen(true);
      requestAnimationFrame(() =>
        menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus(),
      );
    }
  };

  return (
    <li
      id={`discussion-${comment.commentId}`}
      tabIndex={isNew ? -1 : undefined}
      className="rounded-card border border-border bg-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-action/20 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <Author author={comment.author} />
        {(comment.viewerActions.canEdit ||
          comment.viewerActions.canDelete ||
          comment.viewerActions.canReport ||
          comment.viewerActions.canModerate) && (
          <div className="relative">
            <Button
              ref={menuButtonRef}
              variant="ghost"
              size="small"
              iconOnly
              aria-label="Действия с комментарием"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onKeyDown={openMenuFromKeyboard}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <MoreIcon className="size-5" aria-hidden="true" />
            </Button>
            {menuOpen && (
              <div
                role="menu"
                ref={menuRef}
                aria-label="Действия с комментарием"
                onKeyDown={handleMenuKeyDown}
                className="absolute top-10 right-0 z-10 min-w-44 rounded-control border border-border bg-elevated p-1 shadow-lg"
              >
                {comment.viewerActions.canEdit && (
                  <button
                    role="menuitem"
                    className="flex min-h-10 w-full items-center rounded-control px-3 text-left text-sm font-medium text-text-primary hover:bg-control-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
                    onClick={() => {
                      setMenuOpen(false);
                      setEditing(true);
                    }}
                  >
                    Редактировать
                  </button>
                )}
                {comment.viewerActions.canDelete && (
                  <button
                    role="menuitem"
                    className="flex min-h-10 w-full items-center gap-2 rounded-control px-3 text-left text-sm font-medium text-error hover:bg-error/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/20"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmingDelete(true);
                    }}
                  >
                    <DeleteIcon className="size-4" aria-hidden="true" />
                    Удалить
                  </button>
                )}
                {comment.viewerActions.canReport && (
                  <button
                    role="menuitem"
                    className="flex min-h-10 w-full items-center gap-2 rounded-control px-3 text-left text-sm font-medium text-text-primary hover:bg-control-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
                    onClick={() => {
                      setMenuOpen(false);
                      setReporting(true);
                    }}
                  >
                    <ShieldIcon className="size-4" aria-hidden="true" />
                    Пожаловаться
                  </button>
                )}
                {comment.viewerActions.canModerate && (
                  <button
                    role="menuitem"
                    className="flex min-h-10 w-full items-center gap-2 rounded-control px-3 text-left text-sm font-medium text-error hover:bg-error/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/20"
                    onClick={() => {
                      setMenuOpen(false);
                      setModerating(true);
                    }}
                  >
                    <ShieldIcon className="size-4" aria-hidden="true" />
                    Скрыть как модератор
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <CommentEditor
          initialBody={comment.body}
          isPending={updateMutation.isPending}
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
        {wasCommentEdited(comment) && (
          <span title={`Изменено ${formatDate(comment.updatedAt)}`}> · изменено</span>
        )}
      </p>

      {reporting && (
        <div className="mt-4 max-w-xl">
          <ContentReportForm
            target={{ type: 'comment', commentId: comment.commentId }}
            onCancel={() => {
              setReporting(false);
              requestAnimationFrame(() => menuButtonRef.current?.focus());
            }}
            onUnauthorized={onUnauthorized}
          />
        </div>
      )}

      {moderating && (
        <div className="mt-4 max-w-xl">
          <ContentModerationForm
            target={{ type: 'comment', commentId: comment.commentId }}
            onCancel={() => {
              setModerating(false);
              requestAnimationFrame(() => menuButtonRef.current?.focus());
            }}
            onSuccess={() => onDeleted(comment.commentId)}
          />
        </div>
      )}

      {confirmingDelete && (
        <div
          role="alertdialog"
          aria-labelledby={`delete-${comment.commentId}`}
          ref={deleteConfirmRef}
          tabIndex={-1}
          className="mt-4 rounded-control border border-error/40 bg-error/5 p-4"
        >
          <p id={`delete-${comment.commentId}`} className="font-semibold text-text-primary">
            Удалить комментарий?
          </p>
          <p className="mt-1 text-sm text-text-secondary">Это действие нельзя отменить.</p>
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
              onClick={cancelDelete}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function ReviewDiscussion({ review }: DiscussionProps) {
  const { state: authState, setGuest, refresh } = useAuth();
  const queryClient = useQueryClient();
  const commentBodyRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState('');
  const [newCommentId, setNewCommentId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const viewer: SocialViewer =
    authState.status === 'authenticated' ? { accountKey: authState.user.email } : 'guest';
  const viewerReady = authState.status !== 'loading';
  const queryOptions = reviewCommentsQueryOptions(review.reviewId, viewer);
  const query = useInfiniteQuery({ ...queryOptions, enabled: viewerReady });
  const profileQuery = useQuery({
    ...privateProfileQueryOptions(
      authState.status === 'authenticated' ? authState.user.email : 'inactive',
    ),
    enabled: authState.status === 'authenticated',
  });
  const comments = mergeReviewComments(query.data?.pages ?? []);

  useRestoreSocialAction(
    'comment',
    () => commentBodyRef.current?.focus(),
    authState.status === 'authenticated' && review.viewerActions.canComment,
  );

  useEffect(() => {
    if (!newCommentId) return;
    document.getElementById(`discussion-${newCommentId}`)?.focus();
  }, [newCommentId]);

  const patchCommentPages = (
    patch: (pages: readonly ReviewCommentPage[]) => ReviewCommentPage[],
  ) => {
    queryClient.setQueryData<InfiniteData<ReviewCommentPage>>(queryOptions.queryKey, (current) => {
      if (!current) return current;
      return { ...current, pages: patch(current.pages) };
    });
  };
  const appendComment = (comment: ReviewComment) => {
    patchCommentPages((pages) => appendReviewComment(pages, comment));
  };
  const changeReviewCount = (delta: number) => {
    queryClient.setQueriesData<ReviewDetail>(
      {
        predicate: ({ queryKey }) =>
          queryKey.some((part) => part === review.reviewId) &&
          !queryKey.some((part) => part === 'comments'),
      },
      (current) =>
        current?.reviewId === review.reviewId
          ? { ...current, commentCount: Math.max(0, current.commentCount + delta) }
          : current,
    );
  };
  const markCommentViewsStale = () => {
    void queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
        queryKey.some((part) => part === review.reviewId) &&
        queryKey.some((part) => part === 'comments'),
      refetchType: 'none',
    });
  };
  const markProfileCountsStale = (comment: ReviewComment) => {
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

  const createMutation = useMutation({
    mutationFn: (commentBody: string) => createReviewComment(review.reviewId, commentBody),
    onSuccess: (comment) => {
      appendComment(comment);
      changeReviewCount(1);
      markProfileCountsStale(comment);
      setBody('');
      setValidationError(null);
      setNewCommentId(comment.commentId);
      markCommentViewsStale();
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 401) setGuest();
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextError = validateCommentBody(body);
    setValidationError(nextError);
    if (!nextError && !createMutation.isPending) {
      createMutation.mutate(normalizeCommentBody(body));
    }
  };
  const updateCached = (updated: ReviewComment) => {
    patchCommentPages((pages) => replaceReviewComment(pages, updated));
    markCommentViewsStale();
  };
  const deleteCached = (commentId: string) => {
    const deleted = comments.find((comment) => comment.commentId === commentId);
    queryClient.setQueriesData<InfiniteData<ReviewCommentPage>>(
      {
        predicate: ({ queryKey }) =>
          queryKey.some((part) => part === review.reviewId) &&
          queryKey.some((part) => part === 'comments'),
      },
      (current) =>
        current ? { ...current, pages: removeReviewComment(current.pages, commentId) } : current,
    );
    changeReviewCount(-1);
    if (deleted) markProfileCountsStale(deleted);
  };

  return (
    <section aria-labelledby="discussion-title" className="mx-auto mt-8 max-w-5xl">
      <div className="rounded-card border border-border bg-surface-elevated p-5 sm:p-8">
        <h2 id="discussion-title" className="text-2xl font-semibold text-text-primary">
          Обсуждение
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {review.commentCount === 0
            ? 'Комментариев пока нет.'
            : `${review.commentCount} в обсуждении`}
        </p>

        {authState.status === 'authenticated' && review.viewerActions.canComment ? (
          <form
            onSubmit={submit}
            className="mt-6 rounded-control border border-border bg-surface p-4"
          >
            <label htmlFor="new-comment-body" className="font-semibold text-text-primary">
              Добавить комментарий
            </label>
            <textarea
              ref={commentBodyRef}
              id="new-comment-body"
              rows={5}
              value={body}
              placeholder="Поделитесь мнением…"
              onChange={(event) => {
                setBody(event.target.value);
                setValidationError(null);
                if (createMutation.isError) createMutation.reset();
              }}
              className="mt-3 w-full resize-y rounded-control border border-border bg-elevated px-3 py-2 text-sm leading-relaxed text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <span className="text-caption text-text-secondary">
                {Array.from(body).length}/{commentBodyLimit}
              </span>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Отправляем…' : 'Отправить'}
              </Button>
            </div>
            {(validationError || createMutation.isError) && (
              <p role="alert" className="mt-3 text-sm text-error">
                {validationError ?? mutationMessage(createMutation.error, 'create')}
              </p>
            )}
          </form>
        ) : authState.status === 'guest' ? (
          <p className="mt-5 rounded-control border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
            <SocialLoginLink
              intent="comment"
              className="font-semibold text-action hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
            >
              Войдите
            </SocialLoginLink>{' '}
            с возвратом к рецензии, чтобы оставить комментарий.
          </p>
        ) : authState.status === 'error' ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-control border border-border bg-surface px-4 py-3">
            <p role="alert" className="text-sm text-error">
              Не удалось проверить сессию.
            </p>
            <Button variant="secondary" size="small" onClick={() => void refresh()}>
              Повторить
            </Button>
          </div>
        ) : authState.status === 'authenticated' && profileQuery.isError ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-control border border-border bg-surface px-4 py-3">
            <p role="alert" className="text-sm text-error">
              Не удалось проверить доступ к комментариям.
            </p>
            <Button variant="secondary" size="small" onClick={() => void profileQuery.refetch()}>
              Повторить
            </Button>
          </div>
        ) : authState.status === 'authenticated' && profileQuery.data?.emailVerified === false ? (
          <p className="mt-5 rounded-control border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
            Подтвердите email, чтобы участвовать в обсуждении.
          </p>
        ) : authState.status === 'authenticated' && !profileQuery.isPending ? (
          <p className="mt-5 rounded-control border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
            У вас нет права добавить комментарий к этой рецензии.
          </p>
        ) : null}

        <div className="mt-7" aria-live="polite">
          {!viewerReady || query.isPending ? (
            <div aria-label="Загружаем комментарии" className="space-y-3">
              {[0, 1].map((item) => (
                <div
                  key={item}
                  className="h-32 animate-pulse rounded-card bg-control motion-reduce:animate-none"
                />
              ))}
            </div>
          ) : query.isError && !query.data ? (
            <div className="rounded-control border border-error/30 bg-error/5 p-4">
              <p className="font-semibold text-text-primary">Не удалось загрузить обсуждение</p>
              <p className="mt-1 text-sm text-text-secondary">
                Рецензия доступна — можно повторить только загрузку комментариев.
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
          ) : comments.length === 0 ? (
            <p className="rounded-control border border-dashed border-border px-4 py-7 text-center text-sm text-text-secondary">
              Начните обсуждение этой рецензии.
            </p>
          ) : (
            <ul className="space-y-3">
              {comments.map((comment) => (
                <CommentItem
                  key={comment.commentId}
                  comment={comment}
                  isNew={comment.commentId === newCommentId}
                  onUpdated={updateCached}
                  onDeleted={deleteCached}
                  onUnauthorized={setGuest}
                />
              ))}
            </ul>
          )}

          {query.hasNextPage && (
            <div className="mt-5 flex justify-center">
              <LoadMoreButton
                isLoading={query.isFetchingNextPage}
                hasError={query.isFetchNextPageError}
                onClick={() => void query.fetchNextPage()}
              />
            </div>
          )}
          {query.isFetchNextPageError && (
            <p role="alert" className="mt-3 text-center text-sm text-error">
              Следующая страница не загрузилась. Уже показанные комментарии сохранены.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
