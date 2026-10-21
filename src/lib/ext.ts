// The handful of extension APIs this page uses, typed locally. In `npm run dev`
// (a normal tab) they are absent, and callers fall back to browser equivalents.

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

interface ChromeLike {
  runtime?: {
    id?: string;
    getURL(path: string): string;
    sendMessage?(message: unknown): Promise<unknown>;
    onMessage?: {
      addListener(cb: (message: unknown, sender: unknown, sendResponse: (r?: unknown) => void) => boolean | void): void;
    };
    onStartup?: { addListener(cb: () => void): void };
    onInstalled?: { addListener(cb: () => void): void };
  };
  alarms?: {
    create(name: string, info: { when: number }): Promise<void>;
    clear(name: string): Promise<boolean>;
    onAlarm: { addListener(cb: (alarm: { name: string }) => void): void };
  };
  notifications?: {
    create(
      id: string,
      options: { type: 'basic'; iconUrl: string; title: string; message: string; silent?: boolean; priority?: number },
    ): Promise<string>;
    clear(id: string): Promise<boolean>;
    onClicked: { addListener(cb: (id: string) => void): void };
  };
  tabs?: { create(p: { url?: string }): Promise<unknown> };
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
  permissions?: {
    request(p: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
    contains(p: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
    remove(p: { origins?: string[]; permissions?: string[] }): Promise<boolean>;
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
