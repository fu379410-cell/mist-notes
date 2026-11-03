import { chmodSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DockEdge, DockPlacement } from './capsule-geometry';
import { atomicWrite } from './storage';

export interface CapsuleState { enabled: boolean; placements: Record<string, DockPlacement> }
export const MAX_CAPSULE_STATE_BYTES = 4 * 1024 * 1024;
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
const edges = new Set<DockEdge>(['left', 'right', 'top', 'bottom']);

function fail(message: string): never { throw new Error(`${message}，原胶囊布局文件已保留。`); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('胶囊布局格式不正确');
  return value as Record<string, unknown>;
}
function knownKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).some(key => !keys.includes(key))) fail('胶囊布局包含未知字段');
}
function validateState(value: unknown, fromDisk: boolean): CapsuleState {
  const state = object(value);
  knownKeys(state, fromDisk ? ['schemaVersion', 'enabled', 'placements'] : ['enabled', 'placements']);
  if (fromDisk && state.schemaVersion !== 1) fail(`不支持胶囊布局版本 ${String(state.schemaVersion)}`);
  if (typeof state.enabled !== 'boolean') fail('胶囊开关无效');
  const input = object(state.placements);
  const entries = Object.entries(input);
  if (entries.length > 10_000) fail('胶囊数量过多');
  const placements: Record<string, DockPlacement> = {};
  for (const [id, value] of entries) {
    if (!id.trim() || id.length > 128 || forbiddenKeys.has(id)) fail('胶囊便签标识无效');
    const placement = object(value);
    knownKeys(placement, ['edge', 'displayId', 'anchor']);
    if (typeof placement.edge !== 'string' || !edges.has(placement.edge as DockEdge)) fail('胶囊边缘无效');
    if (typeof placement.displayId !== 'number' || !Number.isSafeInteger(placement.displayId)) fail('胶囊显示器标识无效');
    if (typeof placement.anchor !== 'number' || !Number.isFinite(placement.anchor) || placement.anchor < 0 || placement.anchor > 1) fail('胶囊位置无效');
    placements[id] = { edge: placement.edge as DockEdge, displayId: placement.displayId, anchor: placement.anchor };
  }
  return { enabled: state.enabled, placements };
}
function readState(file: string): { state: CapsuleState; data: string } {
  if (statSync(file).size > MAX_CAPSULE_STATE_BYTES) fail('胶囊布局文件过大');
  const data = readFileSync(file, 'utf8');
  let parsed: unknown;
  try { parsed = JSON.parse(data); }
  catch { fail('胶囊布局不是有效 JSON'); }
  return { state: validateState(parsed, true), data };
}

/** Window presentation is independent from notebook content and its schema/version. */
export class CapsuleStore {
  readonly file: string;
  readonly previousFile: string;
  constructor(readonly directory: string) {
    this.file = join(directory, 'capsules.v1.json');
    this.previousFile = join(directory, 'capsules.previous.v1.json');
  }
  load(): CapsuleState {
    return existsSync(this.file) ? readState(this.file).state : { enabled: true, placements: {} };
  }
  save(state: CapsuleState): void {
    const safe = validateState(state, false);
    const data = JSON.stringify({ schemaVersion: 1, ...safe }, null, 2);
    if (Buffer.byteLength(data, 'utf8') > MAX_CAPSULE_STATE_BYTES) fail('胶囊布局文件过大');
    // Validate before touching either file, so a damaged current layout cannot overwrite recovery data.
    const previous = existsSync(this.file) ? readState(this.file).data : undefined;
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    chmodSync(this.directory, 0o700);
    if (previous !== undefined) atomicWrite(this.previousFile, previous);
    atomicWrite(this.file, data);
  }
}
