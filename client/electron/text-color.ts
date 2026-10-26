/** Normalize browser/Tiptap color serialization without accepting arbitrary CSS. */
export function normalizeTextColor(value: string): string | undefined {
  const color = value.trim().toLowerCase();
  if (['', 'inherit', 'currentcolor', 'initial', 'unset', 'revert', 'revert-layer'].includes(color)) return undefined;
  if (color === 'transparent') return '#00000000';
  if (color === 'black') return '#000000';
  if (color === 'white') return '#FFFFFF';
  if (/^#[a-f\d]{3,4}$/.test(color)) return `#${color.slice(1).split('').map((c) => c + c).join('')}`.toUpperCase();
  if (/^#[a-f\d]{6}(?:[a-f\d]{2})?$/.test(color)) return color.toUpperCase();
  const match = color.match(/^rgba?\((.*)\)$/);
  if (!match) throw new Error('文字颜色无效。');
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%?$/i;
  function component(token: string, alpha: boolean): number {
    const trimmed = token.trim();
    if (!numeric.test(trimmed)) throw new Error('文字颜色无效。');
    const percentage = trimmed.endsWith('%');
    const number = Number(percentage ? trimmed.slice(0, -1) : trimmed);
    if (!Number.isFinite(number)) throw new Error('文字颜色无效。');
    const maximum = alpha ? 1 : 255;
    const scaled = percentage ? number / 100 * maximum : number;
    return Math.round(Math.max(0, Math.min(maximum, scaled)) * (alpha ? 255 : 1));
  }
  let channels: string[];
  let alpha: string | undefined;
  if (match[1].includes(',')) {
    if (match[1].includes('/')) throw new Error('文字颜色无效。');
    const parts = match[1].split(',');
    if (parts.length !== 3 && parts.length !== 4) throw new Error('文字颜色无效。');
    channels = parts.slice(0, 3);
    alpha = parts[3];
  } else {
    const parts = match[1].split('/');
    if (parts.length > 2) throw new Error('文字颜色无效。');
    channels = parts[0].trim().split(/\s+/);
    if (channels.length !== 3) throw new Error('文字颜色无效。');
    alpha = parts[1];
  }
  const values = channels.map((channel) => component(channel, false));
  const alphaByte = alpha === undefined ? 255 : component(alpha, true);
  if (alphaByte !== 255) values.push(alphaByte);
  return `#${values.map((value) => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
