import assert from 'node:assert/strict';
import test from 'node:test';
import { OneClickAIError, runOneClickAI, type OneClickAIDependencies } from '../src/one-click-ai';
import type { AIResult } from '../src/shared/ai';
import type { AICall } from '../src/shared/types';

const result: AIResult = { title: '整理后', text: '原文信息已整理。\n\n中文 📝 与空行保留。' };
const success: AICall<AIResult> = { ok: true, value: result };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function harness(overrides: Partial<OneClickAIDependencies> = {}) {
  const document = { title: '原文', text: '中文 📝\n\n信息保留。' };
  const calls: string[] = [];
  const controller = new AbortController();
  const dependencies: OneClickAIDependencies = {
    waitForSave: async () => { calls.push('saved'); },
    snapshot: () => { calls.push('snapshot'); return JSON.stringify(document); },
    generate: async () => { calls.push('generate'); return success; },
    apply: async value => { calls.push('apply'); Object.assign(document, value); },
    signal: controller.signal,
    ...overrides,
  };
  return { document, calls, controller, dependencies };
}

test('one click waits for saving, generates, and automatically applies exactly once', async () => {
  const { document, calls, dependencies } = harness();
  await runOneClickAI(dependencies);
  assert.deepEqual(calls, ['saved', 'snapshot', 'generate', 'snapshot', 'apply']);
  assert.deepEqual(document, result);
  assert.equal(calls.filter(call => call === 'apply').length, 1);
});

test('a document changed during generation is preserved and returns stale without applying', async () => {
  const started = deferred<void>();
  const generated = deferred<AICall<AIResult>>();
  const state = harness({ generate: () => { started.resolve(); return generated.promise; } });
  const running = runOneClickAI(state.dependencies);
  await started.promise;
  state.document.text += '刚刚补充的金额 120 元。';
  const edited = { ...state.document };
  generated.resolve(success);
  await assert.rejects(running, (error: unknown) => error instanceof OneClickAIError && error.code === 'stale');
  assert.deepEqual(state.document, edited);
  assert.ok(!state.calls.includes('apply'));
});

test('cancellation during generation discards even a successful response without applying', async () => {
  const started = deferred<void>();
  const generated = deferred<AICall<AIResult>>();
  const state = harness({ generate: () => { started.resolve(); return generated.promise; } });
  const original = { ...state.document };
  const running = runOneClickAI(state.dependencies);
  await started.promise;
  state.controller.abort();
  generated.resolve(success);
  await assert.rejects(running, (error: unknown) => error instanceof OneClickAIError && error.code === 'cancelled');
  assert.deepEqual(state.document, original);
  assert.ok(!state.calls.includes('apply'));
});

test('cancellation while waiting for saving does not start a provider request', async () => {
  const saved = deferred<void>();
  const state = harness({ waitForSave: () => saved.promise });
  const running = runOneClickAI(state.dependencies);
  state.controller.abort();
  saved.resolve();
  await assert.rejects(running, (error: unknown) => error instanceof OneClickAIError && error.code === 'cancelled');
  assert.deepEqual(state.calls, []);
});

test('a failed save rejects before generating or changing the note', async () => {
  const failure = new Error('正文尚未保存。');
  const state = harness({ waitForSave: async () => { throw failure; } });
  const original = { ...state.document };
  await assert.rejects(runOneClickAI(state.dependencies), error => error === failure);
  assert.deepEqual(state.document, original);
  assert.deepEqual(state.calls, []);
});

test('API failures preserve the original note and expose the safe error code for settings', async () => {
  for (const code of ['missing_key', 'authentication', 'network', 'timeout'] as const) {
    const state = harness({ generate: async () => ({ ok: false, error: { code, message: '服务尚不可用。' } }) });
    const original = { ...state.document };
    await assert.rejects(runOneClickAI(state.dependencies), (error: unknown) => error instanceof OneClickAIError
      && error.code === code && error.message === '服务尚不可用。');
    assert.deepEqual(state.document, original);
    assert.ok(!state.calls.includes('apply'));
  }
});

test('independent notes can organize concurrently without shared hidden state', async () => {
  const first = harness();
  const second = harness();
  await Promise.all([runOneClickAI(first.dependencies), runOneClickAI(second.dependencies)]);
  assert.deepEqual(first.document, result);
  assert.deepEqual(second.document, result);
  assert.equal(first.calls.filter(call => call === 'apply').length, 1);
  assert.equal(second.calls.filter(call => call === 'apply').length, 1);
});
