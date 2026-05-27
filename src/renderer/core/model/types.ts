export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  reasoning_content?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ModelError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ModelResponseChoice {
  message: ModelMessage;
  finish_reason?: string | null;
}

export interface ModelResponse {
  id?: string;
  model?: string;
  choices: ModelResponseChoice[];
  error?: ModelError;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatWithToolsRequest {
  model: string;
  messages: ModelMessage[];
  tools?: ToolDefinition[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  traceId?: string;
}

export interface StreamChunk {
  type: 'text_delta' | 'tool_call_delta' | 'done';
  textDelta?: string;
  toolCallIndex?: number;
  toolCallDelta?: {
    id?: string;
    name?: string;
    argumentsDelta?: string;
  };
}

export interface ModelProvider {
  id: string;
  displayName: string;
  defaultModel: string;
  compactModel: string;
  chatWithTools(request: ChatWithToolsRequest): Promise<ModelResponse>;
  chatWithToolsStream?(
    request: ChatWithToolsRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<ModelResponse>;
  compact(messages: ModelMessage[]): Promise<string>;
}
