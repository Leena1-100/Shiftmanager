type P = { size?: number };

const svg = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const HomeIcon = ({ size = 22 }: P) => svg(size, <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>);
export const ImportIcon = ({ size = 22 }: P) => svg(size, <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></>);
export const WalletIcon = ({ size = 22 }: P) => svg(size, <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M16 13h2" /><path d="M3 10h18" /></>);
export const GearIcon = ({ size = 22 }: P) => svg(size, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>);
export const ChevronLeft = ({ size = 20 }: P) => svg(size, <path d="m15 18-6-6 6-6" />);
export const ChevronRight = ({ size = 20 }: P) => svg(size, <path d="m9 18 6-6-6-6" />);
export const PlusIcon = ({ size = 20 }: P) => svg(size, <><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const ImageIcon = ({ size = 18 }: P) => svg(size, <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></>);
export const SwapIcon = ({ size = 16 }: P) => svg(size, <><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></>);
export const CheckIcon = ({ size = 16 }: P) => svg(size, <path d="M20 6 9 17l-5-5" />);
export const ClockIcon = ({ size = 16 }: P) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const CalendarIcon = ({ size = 22 }: P) => svg(size, <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></>);
export const CloseIcon = ({ size = 20 }: P) => svg(size, <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
