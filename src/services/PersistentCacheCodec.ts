import { StringCompressor } from 'places-shared/utils';

export interface ZstdCachePayload {
  codec: 'zstd-json-v1';
  value: string;
}

export function isZstdCachePayload(value: unknown): value is ZstdCachePayload {
  return typeof value === 'object'
    && value !== null
    && (value as Partial<ZstdCachePayload>).codec === 'zstd-json-v1'
    && typeof (value as Partial<ZstdCachePayload>).value === 'string';
}

export function encodeCachePayload(data: unknown): ZstdCachePayload {
  const json = JSON.stringify(data);
  if (json === undefined) {
    throw new Error('Environmental cache values must be JSON-serializable.');
  }
  return {
    codec: 'zstd-json-v1',
    value: StringCompressor.compressAndEncode(json),
  };
}

export function decodeCachePayload(payload: ZstdCachePayload): unknown {
  return JSON.parse(StringCompressor.decodeAndDecompress(payload.value)) as unknown;
}
