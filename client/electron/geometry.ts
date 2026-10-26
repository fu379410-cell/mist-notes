import type { NoteFrame, PointerPosition } from '../src/shared/types';

export function resizedFrame(start: NoteFrame, initial: PointerPosition, pointer: PointerPosition, area: NoteFrame): NoteFrame {
  const width = Math.min(Math.max(260, area.x + area.width - start.x), Math.max(260, start.width + pointer.screenX - initial.screenX));
  const height = Math.min(Math.max(260, area.y + area.height - start.y), Math.max(260, start.height + pointer.screenY - initial.screenY));
  return { x: Math.round(start.x), y: Math.round(start.y), width: Math.round(width), height: Math.round(height) };
}

export function visibleFrame(frame: NoteFrame, area: NoteFrame): NoteFrame {
  const width = Math.min(Math.max(260, frame.width), Math.max(260, area.width));
  const height = Math.min(Math.max(260, frame.height), Math.max(260, area.height));
  return {
    x: Math.round(Math.max(area.x, Math.min(frame.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(frame.y, area.y + area.height - height))),
    width: Math.round(width), height: Math.round(height),
  };
}
