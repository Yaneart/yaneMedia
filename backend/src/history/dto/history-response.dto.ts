export class HistoryEntryDto {
  mediaRef!: string;
  openedAt!: string;
}

export class HistoryResponseDto {
  entries!: HistoryEntryDto[];
}
