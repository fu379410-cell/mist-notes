import assert from 'node:assert/strict';
import test from 'node:test';
import { resizedFrame, visibleFrame } from '../electron/geometry';

test('corner drag fixes top-left, grows and shrinks, and clamps to screen and minimum', () => {
  const start = { x: 100, y: 100, width: 420, height: 500 };
  const area = { x: 0, y: 24, width: 1440, height: 876 };
  const initial = { screenX: 520, screenY: 600 };
  assert.deepEqual(resizedFrame(start, initial, { screenX: 720, screenY: 700 }, area), { x: 100, y: 100, width: 620, height: 600 });
  assert.deepEqual(resizedFrame(start, initial, { screenX: 300, screenY: 300 }, area), { x: 100, y: 100, width: 260, height: 260 });
  assert.deepEqual(resizedFrame(start, initial, { screenX: 9000, screenY: 9000 }, area), { x: 100, y: 100, width: 1340, height: 800 });
});

test('restores off-screen and negative-monitor frames into selected work area', () => {
  const area = { x: -1920, y: 0, width: 1920, height: 1080 };
  assert.deepEqual(visibleFrame({ x: -3000, y: -200, width: 420, height: 500 }, area), { x: -1920, y: 0, width: 420, height: 500 });
});
