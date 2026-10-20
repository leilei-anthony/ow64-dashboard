import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { menu } from '../ui';

export function ContextMenu() {
  const state = menu.value;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!state || !ref.current) return;
    // Keep the menu on screen near the pointer.
    const { width, height } = ref.current.getBoundingClientRect();
    setPos({
      x: Math.min(state.x, window.innerWidth - width - 8),
      y: Math.min(state.y, window.innerHeight - height - 8),
    });
    ref.current.querySelector<HTMLButtonElement>('button')?.focus();
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const close = () => (menu.value = null);
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [state]);

  if (!state) return null;
  return (
    <div ref={ref} class="ctx-menu" role="menu" style={{ left: pos.x, top: pos.y }}>
      {state.items.map((item) =>
        item.info ? (
          <div class="ctx-info">{item.label}</div>
        ) : (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              menu.value = null;
              item.onSelect?.();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
