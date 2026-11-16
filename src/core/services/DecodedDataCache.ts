export class DecodedDataCache<T> {
  private entries = new Map<string, { t: number; data: T }>();

  constructor(private decode: (data: unknown) => T, private maxEntries = 20) {}

  read(key: string, entry: { t: number; d: unknown }): T {
    const cached = this.entries.get(key);

    if (cached?.t === entry.t) return cached.data;
    const data = this.decode(entry.d);

    this.entries.set(key, { t: entry.t, data });

    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;

      if (oldest !== undefined) this.entries.delete(oldest);
    }

    return data;
  }
}
