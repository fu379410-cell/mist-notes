import type { NoteFrame } from '../src/shared/types';

export type DockEdge = 'left' | 'right' | 'top' | 'bottom';
export interface DockPlacement { edge: DockEdge; displayId: number; anchor: number }

export const CAPSULE_SIZE = { width: 180, height: 48 };
export const CAPSULE_PREVIEW_SIZE = { width: 320, height: 238 };
export const CAPSULE_MARGIN = 8;
const MAX_OVERSHOOT = 64;

function validFrame(frame: NoteFrame): boolean {
  return [frame.x, frame.y, frame.width, frame.height].every(Number.isFinite)
    && frame.width >= 1 && frame.height >= 1;
}
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
function vertical(edge: DockEdge): boolean { return edge === 'left' || edge === 'right'; }

/** Only a completed user drag should call this; ordinary resize/move events must not auto-dock. */
export function findDockEdge(frame: NoteFrame, area: NoteFrame, threshold = 16): DockEdge | null {
  if (!validFrame(frame) || !validFrame(area) || !Number.isFinite(threshold) || threshold < 0) return null;
  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  // A note that is mostly on the adjacent monitor must not attach to this display's edge.
  if (centerX < area.x || centerX > area.x + area.width || centerY < area.y || centerY > area.y + area.height) return null;
  const distances: [DockEdge, number][] = [
    ['left', frame.x - area.x],
    ['right', area.x + area.width - frame.x - frame.width],
    ['top', frame.y - area.y],
    ['bottom', area.y + area.height - frame.y - frame.height],
  ];
  return distances
    .filter(([, distance]) => distance >= -MAX_OVERSHOOT && distance <= threshold)
    .sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0]?.[0] ?? null;
}

/** Store a proportional center, so changing display resolution does not strand the capsule. */
export function dockAnchor(frame: NoteFrame, area: NoteFrame, edge: DockEdge): number {
  if (!validFrame(frame) || !validFrame(area)) throw new Error('胶囊位置无效。');
  return vertical(edge)
    ? clamp((frame.y + frame.height / 2 - area.y) / area.height, 0, 1)
    : clamp((frame.x + frame.width / 2 - area.x) / area.width, 0, 1);
}

/** All coordinates are desktop device-independent pixels, including negative monitor origins. */
export function capsuleBounds(placement: DockPlacement, area: NoteFrame, preview = false): NoteFrame {
  if (!validFrame(area) || !Number.isFinite(placement.anchor)) throw new Error('胶囊工作区无效。');
  const size = preview ? CAPSULE_PREVIEW_SIZE : CAPSULE_SIZE;
  const marginX = Math.min(CAPSULE_MARGIN, Math.floor((area.width - 1) / 2));
  const marginY = Math.min(CAPSULE_MARGIN, Math.floor((area.height - 1) / 2));
  const width = Math.min(size.width, Math.floor(area.width - marginX * 2));
  const height = Math.min(size.height, Math.floor(area.height - marginY * 2));
  const left = area.x + marginX;
  const right = area.x + area.width - marginX - width;
  const top = area.y + marginY;
  const bottom = area.y + area.height - marginY - height;
  const anchor = clamp(placement.anchor, 0, 1);
  const x = vertical(placement.edge)
    ? placement.edge === 'left' ? left : right
    : clamp(area.x + anchor * area.width - width / 2, left, right);
  const y = vertical(placement.edge)
    ? clamp(area.y + anchor * area.height - height / 2, top, bottom)
    : placement.edge === 'top' ? top : bottom;
  return { x: Math.round(x), y: Math.round(y), width, height };
}

function intersection(a: NoteFrame, b: NoteFrame, gap = 0): number {
  return Math.max(0, Math.min(a.x + a.width + gap, b.x + b.width + gap) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height + gap, b.y + b.height + gap) - Math.max(a.y, b.y));
}

/** Find the nearest free slot on the same edge; if full, minimize overlap deterministically. */
export function resolveCapsuleBounds(placement: DockPlacement, area: NoteFrame, occupied: NoteFrame[], preview = false): NoteFrame {
  const target = capsuleBounds(placement, area, preview);
  const isVertical = vertical(placement.edge);
  const axis = isVertical ? 'y' : 'x';
  const length = isVertical ? 'height' : 'width';
  const first = capsuleBounds({ ...placement, anchor: 0 }, area, preview)[axis];
  const last = capsuleBounds({ ...placement, anchor: 1 }, area, preview)[axis];
  const neighbors = occupied.filter(validFrame);
  const positions = new Set<number>([target[axis], first, last]);
  for (const frame of neighbors) {
    positions.add(clamp(frame[axis] - CAPSULE_MARGIN - target[length], first, last));
    positions.add(clamp(frame[axis] + frame[length] + CAPSULE_MARGIN, first, last));
    positions.add(clamp(frame[axis] + frame[length] / 2, first, last));
  }
  const candidates = [...positions].map(position => ({ ...target, [axis]: Math.round(position) }));
  candidates.sort((a, b) => Math.abs(a[axis] - target[axis]) - Math.abs(b[axis] - target[axis]) || a[axis] - b[axis]);
  const free = candidates.find(candidate => neighbors.every(frame => intersection(candidate, frame, CAPSULE_MARGIN) === 0));
  if (free) return free;
  const score = (candidate: NoteFrame) => {
    const overlaps = neighbors.map(frame => intersection(candidate, frame));
    return [overlaps.reduce((sum, value) => sum + value, 0), Math.max(0, ...overlaps)];
  };
  return candidates.sort((a, b) => {
    const sa = score(a); const sb = score(b);
    return sa[0] - sb[0] || sa[1] - sb[1] || Math.abs(a[axis] - target[axis]) - Math.abs(b[axis] - target[axis]) || a[axis] - b[axis];
  })[0];
}
