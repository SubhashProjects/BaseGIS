/** Runtime data-volume guardrails. Tune these without changing feature code. */
export const PERFORMANCE = {
  assetPageSize: 1000,
  assetFetchBatchPages: 2,
  maxClientAssets: 25000,
  maxTableRows: 500,
  importDbChunkSize: 250,
  importMaxDbSync: 50000,
  refreshDebounceMs: 350,
} as const;
