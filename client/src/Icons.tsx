import type { CSSProperties } from 'react';
const paths: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  pin: 'm8 3 8 0-1 7 4 4H5l4-4-1-7M12 14v7',
  palette: 'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4 2 2 0 0 1 0-4h3a5 5 0 0 0 5-5c0-3-4-5-9-5M7 9h.01M11 6h.01M16 7h.01M6 14h.01',
  menu: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'm6 6 12 12M6 18 18 6',
  star: 'm12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4L2.8 9.7l6.4-.9L12 3Z',
  search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Zm5.5-2 5 5',
  archive: 'M4 8h16v12H4V8Zm-1-5h18v5H3V3Zm6 9h6',
  arrow: 'm8 4 8 8-8 8',
  restore: 'M3 11a9 9 0 1 1 2 7M3 4v7h7',
  check: 'm5 12 4 4L19 6',
  undo: 'M4 10h10a6 6 0 0 1 0 12M4 10l5-5M4 10l5 5',
  redo: 'M20 10H10a6 6 0 0 0 0 12m10-12-5-5m5 5-5 5',
  minus: 'M5 12h14',
};
export function Icon({ name, size = 18, style }: {name: string; size?: number; style?: CSSProperties}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={style}><path d={paths[name] ?? paths.menu}/></svg>;
}
