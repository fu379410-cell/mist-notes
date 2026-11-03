import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { capsuleBounds, dockAnchor, findDockEdge, resolveCapsuleBounds, type DockPlacement } from '../electron/capsule-geometry';
import { CapsuleStore, MAX_CAPSULE_STATE_BYTES } from '../electron/capsule-store';

const area = { x: 0, y: 24, width: 1440, height: 876 };
const left: DockPlacement = { edge: 'left', displayId: 1, anchor: 0.5 };

test('completed drags detect four work-area edges and choose the nearest corner edge', () => {
  assert.equal(findDockEdge({ x: 10, y: 200, width: 420, height: 500 }, area), 'left');
  assert.equal(findDockEdge({ x: 1018, y: 200, width: 420, height: 500 }, area), 'right');
  assert.equal(findDockEdge({ x: 500, y: 25, width: 420, height: 500 }, area), 'top');
  assert.equal(findDockEdge({ x: 500, y: 398, width: 420, height: 500 }, area), 'bottom');
  assert.equal(findDockEdge({ x: 9, y: 25, width: 420, height: 500 }, area), 'top');
  assert.equal(findDockEdge({ x: 20, y: 60, width: 420, height: 500 }, area), null);
});

test('edge detection accepts bounded overshoot, rejects distant and adjacent-display windows', () => {
  assert.equal(findDockEdge({ x: -40, y: 100, width: 420, height: 500 }, area), 'left');
  assert.equal(findDockEdge({ x: -65, y: 100, width: 420, height: 500 }, area), null);
  assert.equal(findDockEdge({ x: 1390, y: 24, width: 420, height: 500 }, area), null);
  const negative = { x: -1920, y: -200, width: 1920, height: 1080 };
  assert.equal(findDockEdge({ x: -1928, y: 100, width: 420, height: 500 }, negative), 'left');
  assert.equal(findDockEdge({ x: NaN, y: 0, width: 420, height: 500 }, area), null);
});

test('capsules and previews fit every edge, including negative origins and tiny work areas', () => {
  const negative = { x: -1920, y: -200, width: 1920, height: 1080 };
  for (const a of [area, negative, { x: -10, y: -10, width: 110, height: 40 }, { x: 5, y: 6, width: 1, height: 1 }]) {
    for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
      for (const anchor of [0, 0.5, 1]) {
        for (const preview of [false, true]) {
          const bounds = capsuleBounds({ ...left, edge, anchor }, a, preview);
          assert.ok(bounds.x >= a.x && bounds.y >= a.y);
          assert.ok(bounds.x + bounds.width <= a.x + a.width);
          assert.ok(bounds.y + bounds.height <= a.y + a.height);
          assert.ok(bounds.width >= 1 && bounds.height >= 1);
        }
      }
    }
  }
  assert.deepEqual(capsuleBounds(left, area), { x: 8, y: 438, width: 180, height: 48 });
  assert.deepEqual(capsuleBounds({ ...left, edge: 'right' }, area, true), { x: 1112, y: 343, width: 320, height: 238 });
});

test('proportional anchors follow the correct axis and remain usable after resolution changes', () => {
  const frame = { x: 100, y: 100, width: 420, height: 500 };
  assert.equal(dockAnchor(frame, area, 'left'), (350 - 24) / 876);
  assert.equal(dockAnchor(frame, area, 'top'), 310 / 1440);
  assert.equal(dockAnchor({ ...frame, x: -1000 }, area, 'top'), 0);
  assert.equal(dockAnchor({ ...frame, y: 2000 }, area, 'left'), 1);
  const smaller = { x: -1280, y: 24, width: 1280, height: 720 };
  assert.equal(capsuleBounds({ ...left, anchor: dockAnchor(frame, area, 'left') }, smaller).x, -1272);
});

test('multiple capsules choose the nearest available slot on all four edges', () => {
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    const placement = { ...left, edge };
    const first = resolveCapsuleBounds(placement, area, []);
    const second = resolveCapsuleBounds(placement, area, [first]);
    const third = resolveCapsuleBounds(placement, area, [first, second]);
    const axis = edge === 'left' || edge === 'right' ? 'y' : 'x';
    const length = axis === 'y' ? 'height' : 'width';
    assert.equal(Math.abs(second[axis] - first[axis]), first[length] + 8);
    for (const existing of [first, second]) {
      assert.ok(third[axis] + third[length] + 8 <= existing[axis] || existing[axis] + existing[length] + 8 <= third[axis]);
    }
  }
});

test('crowded edges stay on-screen and prefer partial overlap over an identical slot', () => {
  const short = { x: 0, y: 0, width: 500, height: 112 };
  const first = capsuleBounds({ ...left, anchor: 0 }, short);
  const second = capsuleBounds({ ...left, anchor: 1 }, short);
  const next = resolveCapsuleBounds(left, short, [first, second]);
  assert.ok(next.y >= 8 && next.y + next.height <= 104);
  assert.notDeepEqual(next, first);
  assert.notDeepEqual(next, second);
});

test('capsule layout is versioned separately, private, atomic, and reloads without touching notes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mist-capsules-'));
  try {
    const store = new CapsuleStore(directory);
    assert.deepEqual(store.load(), { enabled: true, placements: {} });
    const state = { enabled: true, placements: { '中文-note': left } };
    store.save(state);
    assert.deepEqual(store.load(), state);
    assert.equal(JSON.parse(readFileSync(store.file, 'utf8')).schemaVersion, 1);
    if (process.platform !== 'win32') assert.equal(statSync(store.file).mode & 0o777, 0o600);
    const first = readFileSync(store.file, 'utf8');
    store.save({ enabled: false, placements: {} });
    assert.equal(readFileSync(store.previousFile, 'utf8'), first);
    assert.deepEqual(store.load(), { enabled: false, placements: {} });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('invalid or oversized stored layouts stay untouched when load or save rejects them', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mist-capsules-'));
  try {
    const store = new CapsuleStore(directory);
    const cases = [
      '{',
      JSON.stringify({ schemaVersion: 2, enabled: true, placements: {} }),
      JSON.stringify({ schemaVersion: 1, enabled: 'yes', placements: {} }),
      '{"schemaVersion":1,"enabled":true,"placements":{"__proto__":{"edge":"left","displayId":1,"anchor":0.5}}}',
      JSON.stringify({ schemaVersion: 1, enabled: true, placements: { bad: { ...left, edge: 'center' } } }),
      JSON.stringify({ schemaVersion: 1, enabled: true, placements: { bad: { ...left, anchor: -1 } } }),
      ' '.repeat(MAX_CAPSULE_STATE_BYTES + 1),
    ];
    for (const data of cases) {
      writeFileSync(store.file, data);
      assert.throws(() => store.load());
      assert.throws(() => store.save({ enabled: true, placements: {} }));
      assert.equal(readFileSync(store.file, 'utf8'), data);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('invalid in-memory layouts cannot overwrite a valid saved state', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mist-capsules-'));
  try {
    const store = new CapsuleStore(directory);
    store.save({ enabled: true, placements: { note: left } });
    const original = readFileSync(store.file, 'utf8');
    for (const patch of [{ anchor: NaN }, { anchor: Infinity }, { anchor: 1.1 }, { displayId: 1.5 }, { displayId: Infinity }]) {
      assert.throws(() => store.save({ enabled: true, placements: { note: { ...left, ...patch } } }));
      assert.equal(readFileSync(store.file, 'utf8'), original);
    }
    assert.throws(() => store.save({ enabled: true, placements: Object.create({ injected: left }) }));
    assert.equal(readFileSync(store.file, 'utf8'), original);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
