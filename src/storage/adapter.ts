import { chromeApi } from '../lib/ext';

export type Changes = Record<string, unknown>;

export interface StorageAdapter {
  getAll(): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  /** New values (undefined = removed) for keys changed by this or another tab. */
  onChanged(cb: (changes: Changes) => void): void;
}

function chromeAdapter(): StorageAdapter {
  const storage = chromeApi!.storage!;
  return {
    getAll: () => storage.local.get(null),
    set: (items) => storage.local.set(items),
    remove: (keys) => storage.local.remove(keys),
    onChanged(cb) {
      storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        cb(Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, c.newValue])));
      });
    },
  };
}

// Dev-only fallback so the page can be built in a normal tab with `npm run dev`.
const PREFIX = 'ow64:';

function localStorageAdapter(): StorageAdapter {
  return {
    async getAll() {
      const out: Record<string, unknown> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (key.startsWith(PREFIX)) out[key.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(key)!);
      }
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) localStorage.setItem(PREFIX + k, JSON.stringify(v));
    },
    async remove(keys) {
      for (const k of keys) localStorage.removeItem(PREFIX + k);
    },
    onChanged(cb) {
      // The `storage` event only fires in *other* tabs, which is all we need here.
      window.addEventListener('storage', (e) => {
        if (!e.key?.startsWith(PREFIX)) return;
        cb({ [e.key.slice(PREFIX.length)]: e.newValue == null ? undefined : JSON.parse(e.newValue) });
      });
    },
  };
}

export function createAdapter(): StorageAdapter {
  return chromeApi?.storage?.local ? chromeAdapter() : localStorageAdapter();
}
