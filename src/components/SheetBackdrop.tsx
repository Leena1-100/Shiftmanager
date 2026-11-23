import { useEffect, useRef, type ReactNode } from 'react';

let locks = 0;
let savedY = 0;

/** Freeze the page behind a sheet so scrolling inside it can't move or jump the page (iOS-safe) */
function lockBody() {
  if (locks++ > 0) return;
  savedY = window.scrollY;
  const b = document.body.style;
  b.position = 'fixed';
  b.top = `-${savedY}px`;
  b.left = '0';
  b.right = '0';
  b.width = '100%';
  b.overflow = 'hidden';
}

function unlockBody() {
  if (--locks > 0) return;
  const b = document.body.style;
  b.position = '';
  b.top = '';
  b.left = '';
  b.right = '';
  b.width = '';
  b.overflow = '';
  window.scrollTo(0, savedY);
}

/**
 * Dimmed backdrop for bottom sheets. Closes only on a real tap on the backdrop — not when a
 * scroll or text selection that started inside the sheet ends outside it.
 */
export default function SheetBackdrop({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const pressedBackdrop = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    lockBody();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      unlockBody();
    };
  }, []);

  return (
    <div
      className="sheet-backdrop"
      onPointerDown={(e) => (pressedBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose();
        pressedBackdrop.current = false;
      }}
    >
      {children}
    </div>
  );
}
