import type { AIErrorCode, AIResult } from './shared/ai';
import type { AICall } from './shared/types';

export type OneClickAIErrorCode = AIErrorCode | 'stale';

export class OneClickAIError extends Error {
  constructor(readonly code: OneClickAIErrorCode, message: string) {
    super(message);
    this.name = 'OneClickAIError';
  }
}

export interface OneClickAIDependencies {
  /** Resolve only after the latest save queue is stable; reject on any save failure. */
  waitForSave(): Promise<void>;
  /** Exact current document, including title and formatting. */
  snapshot(): string;
  generate(): Promise<AICall<AIResult>>;
  /** Apply title and body as a single undoable edit, then save it. */
  apply(result: AIResult): Promise<void>;
  signal: AbortSignal;
}

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new OneClickAIError('cancelled', '已取消本次 AI 整理。');
}

/** One invocation applies at most once. The UI owns per-note reentry and cancellation. */
export async function runOneClickAI({ waitForSave, snapshot, generate, apply, signal }: OneClickAIDependencies): Promise<void> {
  await waitForSave();
  throwIfCancelled(signal);
  const source = snapshot();
  const reply = await generate();
  throwIfCancelled(signal);
  if (!reply.ok) throw new OneClickAIError(reply.error.code, reply.error.message);
  if (snapshot() !== source) {
    throw new OneClickAIError('stale', '整理期间便签已有修改，本次结果未应用。请重新点击 AI 小球。');
  }
  await apply(reply.value);
}
