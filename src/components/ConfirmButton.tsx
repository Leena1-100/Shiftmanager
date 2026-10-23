import { useEffect, useState } from 'react';

interface Props {
  label: string;
  /** Shown after the first tap; a second tap runs onConfirm */
  confirmLabel: string;
  className?: string;
  onConfirm: () => void;
}

/** Two-tap button for destructive actions (works where browser confirm() dialogs are blocked) */
export default function ConfirmButton({ label, confirmLabel, className = 'danger', onConfirm }: Props) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      className={armed ? `${className} armed` : className}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
