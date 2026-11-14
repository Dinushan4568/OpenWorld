/**
 * IndexedDB persistence for the progression profile.
 *
 * The store is deliberately a tiny injectable interface: gameplay tests use a
 * memory store, the browser uses IndexedDB, and the pure progression engine never
 * touches a global database handle.
 */
import type { ProgressionProfile } from './types';

export const PROGRESSION_DB_NAME = 'echoes-progression';
export const PROGRESSION_DB_VERSION = 1;
export const PROGRESSION_STORE_NAME = 'profiles';
export const PROGRESSION_KEY = 'archive';

export interface ProgressionPersistence {
  load(): Promise<unknown>;
  save(profile: ProgressionProfile): Promise<void>;
  clear(): Promise<void>;
  close?(): void;
}

interface StoredRecord {
  id: string;
  savedAt: number;
  profile: ProgressionProfile;
}

export class IndexedDBProgressionStore implements ProgressionPersistence {
  private database: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory | null = globalThis.indexedDB ?? null) {}

  private open(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new Error('IndexedDB is unavailable in this environment'));
    if (this.database) return Promise.resolve(this.database);
    if (this.opening) return this.opening;
    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory!.open(PROGRESSION_DB_NAME, PROGRESSION_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PROGRESSION_STORE_NAME)) {
          database.createObjectStore(PROGRESSION_STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          this.database = null;
          this.opening = null;
        };
        this.database = database;
        this.opening = null;
        resolve(database);
      };
      request.onerror = () => {
        this.opening = null;
        reject(request.error ?? new Error('Could not open the progression database'));
      };
      request.onblocked = () => {
        this.opening = null;
        reject(new Error('The progression database is blocked by another tab'));
      };
    });
    return this.opening;
  }

  async load(): Promise<unknown> {
    const database = await this.open();
    return new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction(PROGRESSION_STORE_NAME, 'readonly');
      const request = transaction.objectStore(PROGRESSION_STORE_NAME).get(PROGRESSION_KEY);
      request.onsuccess = () => {
        const record = request.result as StoredRecord | undefined;
        resolve(record?.profile ?? null);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not read the progression save'));
    });
  }

  async save(profile: ProgressionProfile): Promise<void> {
    const database = await this.open();
    const record: StoredRecord = { id: PROGRESSION_KEY, savedAt: Date.now(), profile };
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PROGRESSION_STORE_NAME, 'readwrite');
      transaction.objectStore(PROGRESSION_STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not write the progression save'));
      transaction.onabort = () => reject(transaction.error ?? new Error('The progression save was aborted'));
    });
  }

  async clear(): Promise<void> {
    const database = await this.open();
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PROGRESSION_STORE_NAME, 'readwrite');
      transaction.objectStore(PROGRESSION_STORE_NAME).delete(PROGRESSION_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not clear the progression save'));
    });
  }

  close(): void {
    this.database?.close();
    this.database = null;
    this.opening = null;
  }
}

/** In-memory persistence used by tests and as a fallback if IndexedDB is blocked. */
export class MemoryProgressionStore implements ProgressionPersistence {
  private record: ProgressionProfile | null = null;
  public saves = 0;
  public clears = 0;

  async load(): Promise<unknown> {
    return this.record ? structuredClone(this.record) : null;
  }

  async save(profile: ProgressionProfile): Promise<void> {
    this.record = structuredClone(profile);
    this.saves += 1;
  }

  async clear(): Promise<void> {
    this.record = null;
    this.clears += 1;
  }
}
