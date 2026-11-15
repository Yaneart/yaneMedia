import { useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { TorrentCandidate, TorrentCandidates } from '@/entities/torrent-session';
import { Button, Select, Spinner } from '@/shared';
import { CandidateCard } from './CandidateCard';
import {
  candidateOptions,
  candidateTrackerLabel,
  emptyCandidateFilters,
  selectCandidates,
  type CandidateFilters,
  type CandidateSort,
} from '../model/candidateView';

export function TorrentCandidatesPanel({
  query,
  pending,
  selectedCandidateRef,
  status,
  onRefresh,
  onSelect,
}: {
  query: Pick<UseQueryResult<TorrentCandidates>, 'data' | 'isPending' | 'isFetching' | 'isError'>;
  pending: boolean;
  selectedCandidateRef?: string | null;
  status?: string;
  onRefresh: () => void;
  onSelect: (candidate: TorrentCandidate) => void;
}) {
  const [candidateSort, setCandidateSort] = useState<CandidateSort>('best');
  const [candidateFilters, setCandidateFilters] = useState<CandidateFilters>(emptyCandidateFilters);
  const allCandidates = query.data?.candidates ?? [];
  const visibleCandidates = selectCandidates(allCandidates, candidateSort, candidateFilters);
  const hasCandidateFilters = Object.values(candidateFilters).some(Boolean);
  const updateCandidateFilter = (key: keyof CandidateFilters, value: string | boolean) => {
    setCandidateFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="space-y-3" aria-label="Найденные раздачи">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-text-primary">Найденные раздачи</h3>
        <Button variant="secondary" size="small" disabled={query.isFetching} onClick={onRefresh}>
          Обновить
        </Button>
      </div>
      {query.isPending || (query.isFetching && !query.data) ? (
        <div className="flex min-h-36 flex-col items-center justify-center gap-3 py-6">
          <Spinner size="large" label="Ищем раздачи" />
          <p className="text-sm text-text-secondary">Ищем раздачи…</p>
        </div>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-error">
          Поиск сейчас недоступен. Повторите попытку или добавьте торрент вручную.
        </p>
      ) : query.data ? (
        <>
          {query.data.candidates.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Подходящих раздач не найдено. Попробуйте обновить поиск или добавить торрент вручную.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 rounded-control bg-control/50 p-2 min-[480px]:grid-cols-3">
                <div className="min-w-0 text-xs text-text-secondary">
                  <span>Сортировка</span>
                  <Select
                    aria-label="Сортировка"
                    value={candidateSort}
                    onChange={(value) => setCandidateSort(value as CandidateSort)}
                    allowEmpty={false}
                    matchMenuWidth
                    placeholder="Лучшие"
                    options={[
                      { value: 'best', label: 'Лучшие' },
                      { value: 'newest', label: 'Сначала новые' },
                      { value: 'seeders', label: 'Больше раздающих' },
                    ]}
                    className="mt-1 block w-full min-w-0 [&>button]:min-h-8 [&>button]:min-w-0 [&>button]:px-2 [&>button]:text-xs"
                  />
                </div>
                {(['tracker', 'resolution', 'quality', 'voice'] as const).map((field) => (
                  <div key={field} className="min-w-0 text-xs text-text-secondary">
                    <span>
                      {
                        {
                          tracker: 'Источник',
                          resolution: 'Разрешение',
                          quality: 'Качество',
                          voice: 'Озвучка',
                        }[field]
                      }
                    </span>
                    <Select
                      aria-label={
                        {
                          tracker: 'Источник раздачи',
                          resolution: 'Разрешение',
                          quality: 'Качество',
                          voice: 'Озвучка',
                        }[field]
                      }
                      value={candidateFilters[field] || null}
                      onChange={(value) => updateCandidateFilter(field, value ?? '')}
                      placeholder="Все"
                      matchMenuWidth
                      options={candidateOptions(allCandidates, field).map(({ value, count }) => ({
                        value,
                        label: `${field === 'tracker' ? candidateTrackerLabel(value) : value} (${count})`,
                      }))}
                      className="mt-1 block w-full min-w-0 [&>button]:min-h-8 [&>button]:min-w-0 [&>button]:px-2 [&>button]:text-xs"
                    />
                  </div>
                ))}
                {allCandidates.some((item) => item.seeders !== null) && (
                  <label className="flex items-center gap-2 self-end py-2 text-sm text-text-primary">
                    <input
                      type="checkbox"
                      checked={candidateFilters.seededOnly}
                      onChange={(event) =>
                        updateCandidateFilter('seededOnly', event.target.checked)
                      }
                    />
                    Только с раздающими
                  </label>
                )}
              </div>
              <div
                className="flex flex-wrap items-center gap-3 text-sm text-text-secondary"
                role="status"
              >
                <span>
                  Показано {visibleCandidates.length} из {allCandidates.length} ·{' '}
                  {
                    {
                      best: 'Лучшие',
                      newest: 'Сначала новые',
                      seeders: 'Больше раздающих',
                    }[candidateSort]
                  }
                </span>
                {hasCandidateFilters && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setCandidateFilters(emptyCandidateFilters)}
                  >
                    Сбросить фильтры
                  </Button>
                )}
              </div>
              {visibleCandidates.length === 0 && (
                <p className="text-sm text-text-secondary">
                  Варианты скрыты выбранными фильтрами. Сбросьте фильтры или обновите поиск.
                </p>
              )}
              <div className="space-y-2">
                {visibleCandidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.candidateRef}
                    candidate={candidate}
                    pending={pending}
                    selected={selectedCandidateRef === candidate.candidateRef}
                    status={selectedCandidateRef === candidate.candidateRef ? status : undefined}
                    onSelect={() => onSelect(candidate)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
