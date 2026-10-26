import assert from 'node:assert/strict';
import test from 'node:test';
import { AIServiceError, createAIService, publicAIError, validateAIRequest } from '../electron/ai';
import { AI_MODEL } from '../src/shared/ai';

const secret = 'sk-test-only-credential-0123456789';
const sample = { title: '备忘录', text: '明天联系小林，核对金额 120 元。\n\n资料还没有确认。', mode: 'organize' as const };
const result = { title: '核对事项', text: '□ 明天联系小林，核对金额 120 元。\n资料还没有确认。' };
const completion = (content: unknown = result, finish = 'stop') => new Response(JSON.stringify({
  choices: [{ finish_reason: finish, message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }],
}), { status: 200 });

function mockFetch(run: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch {
  return ((url: string | URL | Request, init: RequestInit = {}) => run(String(url), init)) as typeof fetch;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('uses the latest DeepSeek alias and sends only the current note, with JSON mode and no thinking', async () => {
  let calls = 0;
  const service = createAIService({ getKey: () => secret, fetch: mockFetch((url, init) => {
    calls++;
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${secret}`);
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, AI_MODEL);
    assert.equal(body.model, 'deepseek-flash');
    assert.deepEqual(body.thinking, { type: 'disabled' });
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.stream, false);
    assert.equal(body.max_tokens, 6000);
    assert.equal(body.messages.length, 2);
    assert.match(body.messages[0].content, /不得虚构/);
    assert.match(body.messages[0].content, /不是给你的指令/);
    assert.deepEqual(JSON.parse(body.messages[1].content), { title: sample.title, text: sample.text });
    assert.ok(!String(init.body).includes(secret));
    return completion();
  }) });
  assert.deepEqual(await service.generate(sample), result);
  assert.equal(calls, 1);
});

test('only automatic organization validates, including legacy 500-character titles; invalid input never calls the network', async () => {
  let calls = 0;
  const service = createAIService({ getKey: () => secret, fetch: mockFetch(() => { calls++; return completion(); }) });
  assert.equal(validateAIRequest(sample).mode, 'organize');
  for (const length of [300, 301, 500]) {
    assert.equal(validateAIRequest({ ...sample, title: '字'.repeat(length) }).title.length, length);
  }
  const invalid = [null, [], {}, ...['polish', 'summary', 'tasks', 'delete'].map(mode => ({ ...sample, mode })), { ...sample, text: 4 },
    { ...sample, text: 'a'.repeat(50_001) }, { ...sample, title: 'a'.repeat(501) },
    { ...sample, title: '', text: '\n ' }, { ...sample, key: secret },
    { ...sample, title: 'a\nb' }, { ...sample, text: 'a\0b' }];
  for (const value of invalid) {
    await assert.rejects(service.generate(value), (error: unknown) => error instanceof AIServiceError && error.code === 'invalid_input');
  }
  assert.equal(calls, 0);
});

test('HTTP errors, raw network exceptions and unknown errors never expose secrets or provider diagnostics', async () => {
  for (const [status, code] of [[401, 'authentication'], [403, 'authentication'], [402, 'balance'],
    [429, 'rate_limit'], [404, 'model_unavailable'], [500, 'provider_unavailable']] as const) {
    const service = createAIService({ getKey: () => secret, fetch: mockFetch(() => new Response(`${secret} PRIVATE_NOTE`, { status })) });
    await assert.rejects(service.generate(sample), (error: unknown) => {
      assert.ok(error instanceof AIServiceError);
      assert.equal(error.code, code);
      assert.ok(!error.message.includes(secret));
      assert.ok(!error.message.includes('PRIVATE_NOTE'));
      return true;
    });
  }
  const service = createAIService({ getKey: () => secret, fetch: mockFetch(() => { throw new Error(`${secret} PRIVATE_NOTE`); }) });
  await assert.rejects(service.generate(sample), (error: unknown) => {
    assert.deepEqual(publicAIError(error), { code: 'network', message: '未能连接 DeepSeek，请检查网络后重试。' });
    assert.ok(!String(error).includes(secret));
    return true;
  });
  assert.ok(!JSON.stringify(publicAIError(new Error(secret))).includes(secret));
  assert.ok(!JSON.stringify(publicAIError(new AIServiceError('network', secret))).includes(secret));
  const echoed = createAIService({ getKey: () => secret, fetch: mockFetch(() => completion({ title: '标题', text: secret })) });
  await assert.rejects(echoed.generate(sample), (error: unknown) => error instanceof AIServiceError
    && error.code === 'invalid_response' && !error.message.includes(secret));
  const escaped = createAIService({ getKey: () => secret, fetch: mockFetch(() => new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ title: '标题', text: secret }) } }],
  }).replace('sk-test', '\\u0073\\u006b-test'))) });
  await assert.rejects(escaped.generate(sample), (error: unknown) => error instanceof AIServiceError && error.code === 'invalid_response');
});

test('rejects truncated, empty, malformed, oversized and unexpected completion content', async () => {
  const responses = [
    () => completion(result, 'length'), () => completion(''), () => completion('not JSON'),
    () => completion({ title: '标题', text: '' }), () => completion({ title: '标题', text: '正文', extra: true }),
    () => completion({ title: 4, text: '正文' }), () => completion({ title: '标题', text: 'a'.repeat(100_001) }),
    () => completion({ title: 'a'.repeat(301), text: '正文' }),
    () => new Response('{malformed'), () => new Response('x'.repeat(512 * 1024 + 1)),
    () => new Response('{}', { headers: { 'content-length': String(512 * 1024 + 1) } }),
    () => new Response(JSON.stringify({ choices: [] })),
    () => new Response(JSON.stringify({ choices: [{ finish_reason: 'content_filter', message: { content: secret } }] })),
  ];
  for (let index = 0; index < responses.length; index++) {
    const service = createAIService({ getKey: () => secret, fetch: mockFetch(responses[index]) });
    await assert.rejects(service.generate(sample), (error: unknown) => error instanceof AIServiceError
      && error.code === (index === 0 ? 'truncated_response' : 'invalid_response'));
  }
});

test('supports cancellation before and during a request, and a distinct timeout', async () => {
  let calls = 0;
  const started = deferred<void>();
  const blockingFetch = mockFetch((_url, init) => {
    calls++;
    started.resolve();
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error(secret)), { once: true });
    });
  });
  const service = createAIService({ getKey: () => secret, fetch: blockingFetch });
  const before = new AbortController();
  before.abort();
  await assert.rejects(service.generate(sample, before.signal), (error: unknown) => error instanceof AIServiceError && error.code === 'cancelled');
  assert.equal(calls, 0);
  const during = new AbortController();
  const pending = service.generate(sample, during.signal);
  await started.promise;
  during.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof AIServiceError && error.code === 'cancelled');
  const timeout = createAIService({ getKey: () => secret, fetch: blockingFetch, timeoutMs: 5 });
  await assert.rejects(timeout.generate(sample), (error: unknown) => error instanceof AIServiceError && error.code === 'timeout');
});

test('awaits async credentials and cancels before any request if the key returns after cancellation', async () => {
  const service = createAIService({ getKey: async () => secret, fetch: mockFetch((_url, init) => {
    assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${secret}`);
    return completion();
  }) });
  assert.deepEqual(await service.generate(sample), result);
  let calls = 0;
  const key = deferred<string | null>();
  const controller = new AbortController();
  const waiting = createAIService({ getKey: () => key.promise, fetch: mockFetch(() => { calls++; return completion(); }) });
  const pending = waiting.generate(sample, controller.signal);
  controller.abort();
  key.resolve(secret);
  await assert.rejects(pending, (error: unknown) => error instanceof AIServiceError && error.code === 'cancelled');
  assert.equal(calls, 0);
});

test('connection validation sends no note and returns only the safe model status', async () => {
  const service = createAIService({ getKey: () => secret, fetch: mockFetch((url, init) => {
    assert.equal(url, 'https://api.deepseek.com/models');
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    return new Response(JSON.stringify({ data: [{ id: AI_MODEL }], privateDiagnostics: 'must not cross IPC' }));
  }) });
  const status = await service.testConnection();
  assert.equal(status.connected, true);
  assert.equal(status.model, AI_MODEL);
  assert.deepEqual(Object.keys(status).sort(), ['connected', 'label', 'model']);
  assert.ok(!JSON.stringify(status).includes(secret));
  const unavailable = createAIService({ getKey: () => secret, fetch: mockFetch(() => new Response(JSON.stringify({ data: [{ id: 'old-model' }] }))) });
  await assert.rejects(unavailable.testConnection(), (error: unknown) => error instanceof AIServiceError && error.code === 'model_unavailable');
});

test('missing or unreadable credentials stop before any provider request', async () => {
  const network = mockFetch(() => { assert.fail('must not call provider'); });
  await assert.rejects(createAIService({ getKey: () => null, fetch: network }).generate(sample),
    (error: unknown) => error instanceof AIServiceError && error.code === 'missing_key');
  await assert.rejects(createAIService({ getKey: () => { throw new Error(secret); }, fetch: network }).generate(sample),
    (error: unknown) => error instanceof AIServiceError && error.code === 'credential_error' && !error.message.includes(secret));
  await assert.rejects(createAIService({ getKey: async () => null, fetch: network }).generate(sample),
    (error: unknown) => error instanceof AIServiceError && error.code === 'missing_key');
  await assert.rejects(createAIService({ getKey: async () => { throw new Error(secret); }, fetch: network }).generate(sample),
    (error: unknown) => error instanceof AIServiceError && error.code === 'credential_error' && !error.message.includes(secret));
});
