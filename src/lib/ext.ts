// The handful of extension APIs this page uses, typed locally. In `npm run dev`
// (a normal tab) they are absent, and callers fall back to browser equivalents.

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

interface ChromeLike {
  runtime?: { id?: string; getURL(path: string): string };
  storage?: {
    local: {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    };
    onChanged: {
      addListener(cb: (changes: Record<string, StorageChange>, areaName: string) => void): void;
    };
  };
  search?: {
    query(info: { text: string; disposition?: 'CURRENT_TAB' | 'NEW_TAB' | 'NEW_WINDOW' }): Promise<void>;
  };
}

export const chromeApi = (globalThis as unknown as { chrome?: ChromeLike }).chrome;

export const isExtension = !!chromeApi?.runtime?.id;

/** The browser's cached favicon for a page, or null outside the extension. */
export function faviconUrl(pageUrl: string, size = 64): string | null {
  if (!isExtension || !chromeApi?.runtime) return null;
  const url = new URL(chromeApi.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.toString();
}

/** Search with the user's default engine (extension) or Brave Search (dev). */
export function runSearch(text: string, newTab: boolean): void {
  if (chromeApi?.search) {
    void chromeApi.search.query({ text, disposition: newTab ? 'NEW_TAB' : 'CURRENT_TAB' });
    return;
  }
  const url = `https://search.brave.com/search?q=${encodeURIComponent(text)}`;
  if (newTab) window.open(url, '_blank', 'noopener');
  else location.href = url;
}
