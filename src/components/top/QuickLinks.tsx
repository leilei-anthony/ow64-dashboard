import { useState } from 'preact/hooks';
import type { QuickLink } from '../../model/types';
import { quickLinks, setQuickLinks } from '../../storage/store';
import { faviconUrl } from '../../lib/ext';
import { linkDialog, openMenu } from '../../ui';
import { IconPlus } from '../icons';

function letterColor(title: string): string {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 42%)`;
}

function LinkIcon({ link }: { link: QuickLink }) {
  const src = faviconUrl(link.url);
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={src} alt="" width={28} height={28} onError={() => setFailed(true)} />;
  }
  const letter = (link.title || new URL(link.url).hostname).trim().charAt(0).toUpperCase();
  return (
    <span class="link-letter" style={{ background: letterColor(link.title || link.url) }}>
      {letter}
    </span>
  );
}

export function QuickLinks() {
  const links = quickLinks.value;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const move = (fromId: string, toId: string) => {
    const from = links.findIndex((l) => l.id === fromId);
    const to = links.findIndex((l) => l.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...links];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setQuickLinks(next);
  };

  return (
    <nav class="links" aria-label="Quick links">
      {links.map((link) => (
        <a
          key={link.id}
          href={link.url}
          class={`link-tile${dragId === link.id ? ' is-dragging' : ''}${overId === link.id ? ' is-over' : ''}`}
          draggable
          title={link.url}
          onDragStart={(e) => {
            setDragId(link.id);
            e.dataTransfer!.effectAllowed = 'move';
            e.dataTransfer!.setData('text/plain', link.url);
          }}
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            setOverId(link.id);
          }}
          onDragLeave={() => setOverId((id) => (id === link.id ? null : id))}
          onDrop={(e) => {
            e.preventDefault();
            if (dragId) move(dragId, link.id);
            setDragId(null);
            setOverId(null);
          }}
          onDragEnd={() => {
            setDragId(null);
            setOverId(null);
          }}
          onContextMenu={(e) =>
            openMenu(e, [
              { label: 'Edit link…', onSelect: () => (linkDialog.value = { link }) },
              { label: 'Remove', onSelect: () => setQuickLinks(links.filter((l) => l.id !== link.id)) },
            ])
          }
        >
          <span class="link-icon">
            <LinkIcon link={link} />
          </span>
          <span class="link-title">{link.title || new URL(link.url).hostname}</span>
        </a>
      ))}
      <button type="button" class="link-tile" onClick={() => (linkDialog.value = { link: null })}>
        <span class="link-icon link-add">
          <IconPlus />
        </span>
        <span class="link-title">Add site</span>
      </button>
    </nav>
  );
}
