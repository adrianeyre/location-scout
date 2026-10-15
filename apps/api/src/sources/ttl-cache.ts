interface Entry {
  value: unknown;
  expiresAt: number;
}

/**
 * A cache whose entries expire after a time to live. It is a plain in-memory
 * map: nothing is written to disk and a restart empties it (PRD NFR-1.4,
 * ADR 0002).
 */
export class TtlCache {
  readonly #entries = new Map<string, Entry>();

  /** The value stored under `key`, or `undefined` if it is missing or expired. */
  get(key: string): unknown {
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.#entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}
