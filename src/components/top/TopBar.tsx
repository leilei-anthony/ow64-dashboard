import { useState } from 'preact/hooks';
import { now, settings } from '../../storage/store';
import { runSearch } from '../../lib/ext';
import { QuickLinks } from './QuickLinks';

function Clock() {
  const d = now.value;
  const h24 = settings.value.clock24h;
  const hours = h24 ? String(d.getHours()).padStart(2, '0') : String(d.getHours() % 12 || 12);
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return (
    <div class="clock">
      <div class="clock-time">
        {hours}:{minutes}
        {!h24 && <small>{d.getHours() < 12 ? 'AM' : 'PM'}</small>}
      </div>
      <div class="clock-date">
        {d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
    </div>
  );
}

function SearchBox() {
  const [text, setText] = useState('');
  return (
    <form
      class="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) runSearch(text.trim(), false);
      }}
    >
      <input
        type="search"
        value={text}
        placeholder="Search the web"
        aria-label="Search the web"
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) {
            e.preventDefault();
            runSearch(text.trim(), true);
          }
        }}
      />
    </form>
  );
}

export function TopBar() {
  const s = settings.value;
  return (
    <header class="topbar">
      <div class="topbar-left">{s.showClock && <Clock />}</div>
      <div class="topbar-center">
        <QuickLinks />
        {s.showSearch && <SearchBox />}
      </div>
      <div class="topbar-right" />
    </header>
  );
}
