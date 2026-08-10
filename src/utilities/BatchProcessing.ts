import { sleep } from "places-shared/utils";

export interface BatchOptions {
  batchSize?: number;
  delayBetweenBatchesMs?: number;
}

const DEFAULT_BATCH_OPTIONS: Required<BatchOptions> = {
  batchSize: 3,
  delayBetweenBatchesMs: 100,
};

export interface BatchResult<T> {
  results: T[];
  errors: Array<{ index: number; error: Error }>;
}

export async function processBatches<T, R>(items: T[], processFn: (item: T, index: number) => Promise<R>, options?: BatchOptions): Promise<BatchResult<R>> {
  const opts = { ...DEFAULT_BATCH_OPTIONS, ...options };
  const results: R[] = [];
  const errors: Array<{ index: number; error: Error }> = [];

  for (let i = 0; i < items.length; i += opts.batchSize) {
    const batch = items.slice(i, i + opts.batchSize);
    const batchStartIndex = i;

    const batchResults = await Promise.allSettled(
      batch.map((item, batchIndex) => processFn(item, batchStartIndex + batchIndex))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        errors.push({
          index: batchStartIndex + j,
          error: result.reason instanceof Error ? result.reason : new Error(String(result.reason))
        });
      }
    }

    if (i + opts.batchSize < items.length && opts.delayBetweenBatchesMs > 0) {
      await sleep(opts.delayBetweenBatchesMs);
    }
  }

  return { results, errors };
}
