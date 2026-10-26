export const AI_MODEL = 'deepseek-flash';
export const AI_MODEL_LABEL = 'DeepSeek V4.1 Flash · 1017';

export const AI_MODES = ['organize'] as const;
export type AIMode = typeof AI_MODES[number];

export interface AIRequest {
  title: string;
  text: string;
  mode: AIMode;
}

export interface AIResult {
  title: string;
  text: string;
}

export interface AICredentialStatus {
  configured: boolean;
  canStore: boolean;
  model: typeof AI_MODEL;
  label: typeof AI_MODEL_LABEL;
}

export interface AIConnectionResult {
  connected: true;
  model: typeof AI_MODEL;
  label: typeof AI_MODEL_LABEL;
}

export type AIErrorCode =
  | 'invalid_input' | 'missing_key' | 'secure_storage_unavailable' | 'credential_error'
  | 'authentication' | 'balance' | 'rate_limit' | 'provider_unavailable' | 'network'
  | 'timeout' | 'cancelled' | 'invalid_response' | 'truncated_response' | 'model_unavailable';

/** Only these safe codes and messages may cross the main/renderer boundary. */
export interface AIErrorInfo {
  code: AIErrorCode;
  message: string;
}
