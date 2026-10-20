import { useState } from 'preact/hooks';
import type { QuickLink } from '../../model/types';
import { uid } from '../../model/ids';
import { quickLinks, setQuickLinks } from '../../storage/store';
import { safeUrl } from '../../storage/normalize';
import { linkDialog } from '../../ui';
import { Modal } from '../Modal';

function LinkForm({ link }: { link: QuickLink | null }) {
  const [title, setTitle] = useState(link?.title ?? '');
  const [url, setUrl] = useState(link?.url ?? '');
  const [error, setError] = useState('');
  const close = () => (linkDialog.value = null);

  const save = (e: Event) => {
    e.preventDefault();
    const clean = safeUrl(url);
    if (!clean) {
      setError('Enter a web address, e.g. example.com');
      return;
    }
    const name = title.trim() || new URL(clean).hostname.replace(/^www\./, '');
    const links = quickLinks.value;
    setQuickLinks(
      link
        ? links.map((l) => (l.id === link.id ? { ...l, title: name, url: clean } : l))
        : [...links, { id: uid(), title: name, url: clean }],
    );
    close();
  };

  return (
    <Modal title={link ? 'Edit link' : 'Add site'} onClose={close}>
      <form class="form" onSubmit={save}>
        <label>
          Name
          <input value={title} placeholder="e.g. CU" onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <label>
          URL
          <input
            value={url}
            placeholder="example.com"
            autoFocus
            onInput={(e) => {
              setUrl(e.currentTarget.value);
              setError('');
            }}
          />
        </label>
        {error && <p class="form-error">{error}</p>}
        <div class="form-actions">
          {link && (
            <button
              type="button"
              class="btn btn-danger-quiet"
              onClick={() => {
                setQuickLinks(quickLinks.value.filter((l) => l.id !== link.id));
                close();
              }}
            >
              Remove
            </button>
          )}
          <span class="spacer" />
          <button type="button" class="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function LinkEditDialog() {
  const state = linkDialog.value;
  return state ? <LinkForm key={state.link?.id ?? 'new'} link={state.link} /> : null;
}
