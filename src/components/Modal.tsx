import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { IconX } from './icons';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  variant?: 'dialog' | 'drawer';
}

/** Native <dialog> shown modally: focus trap, Escape and backdrop click close it. */
export function Modal({ title, onClose, children, variant = 'dialog' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      class={`modal modal-${variant}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // The browser can still force-close it (e.g. Escape pressed twice); keep state in step.
      onClose={onClose}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div class="modal-body">
        <header class="modal-head">
          <h2>{title}</h2>
          <button type="button" class="icon-btn" aria-label="Close" onClick={onClose}>
            <IconX />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
