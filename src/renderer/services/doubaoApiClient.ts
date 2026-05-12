import axios from 'axios';
import apiConfig from '../config/apiConfig';
import { createLogger } from '../../shared/logger';

const logger = createLogger('model');

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface DoubaoRequest {
  model: string;
  messages: Message[];
  temperature: number;
  top_p: number;
  max_tokens: number;
  stream?: boolean; // 是否使用流式输出
}

interface DoubaoResponse {
  choices: [
    {
      message: {
        role: string;
        content: string;
      };
    }
  ];
}

// SSE 流式响应的 delta 结构
interface StreamDelta {
  choices: Array<{
    delta?: {
      role?: string;
      content?: string;
    };
    index: number;
    finish_reason?: string | null;
  }>;
}

/**
 * 非流式发送消息到豆包（原有功能，保持兼容）
 */
export async function sendMessageToDoubao(
  userInput: string,
  history: Array<{ role: string; content: string }> = [],
  systemPrompt: string = ''
): Promise<string> {
  try {
    const messages: Message[] = [];

    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    messages.push(...history as Message[]);

    messages.push({
      role: 'user',
      content: userInput
    });

    const requestData: DoubaoRequest = {
      model: apiConfig.model,
      messages,
      temperature: apiConfig.temperature,
      top_p: apiConfig.topP,
      max_tokens: apiConfig.maxTokens,
    };

    logger.debug('Legacy Doubao API request', requestData);

    const response = await axios.post<DoubaoResponse>(apiConfig.apiUrl, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`,
      },
    });

    logger.debug('Legacy Doubao API response', response.data);

    return response.data.choices[0].message.content;
  } catch (error: any) {
    logger.error('Legacy Doubao API call failed', error);
    if (error.response) {
      logger.error('Legacy Doubao API error response', error.response.data);
    }
    throw new Error('与 AI 助手通信失败，请稍后重试');
  }
}

/**
 * 流式发送消息到豆包（SSE - Server Sent Events）
 * 
 * 使用方式：
 * ```typescript
 * for await (const chunk of sendMessageToDoubaoStream('你好')) {
 *   // 每次收到一个 token
 * }
 * ```
 * 
 * 或者使用回调模式：
 * ```typescript
 * await sendMessageToDoubaoStream('你好', [], '', {
 *   onChunk: (text) => handleChunk(text),
 *   onComplete: (fullText) => handleComplete(fullText)
 * });
 * ```
 */
export async function* sendMessageToDoubaoStream(
  userInput: string,
  history: Array<{ role: string; content: string }> = [],
  systemPrompt: string = ''
): AsyncGenerator<string> {
  if (!userInput.trim()) {
    throw new Error('用户输入不能为空');
  }

  if (!apiConfig.apiKey || !apiConfig.apiUrl) {
    throw new Error('API 配置不完整');
  }

  const messages: Message[] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push(...history as Message[]);
  messages.push({ role: 'user', content: userInput });

  const requestData: DoubaoRequest = {
    model: apiConfig.model,
    messages,
    temperature: apiConfig.temperature,
    top_p: apiConfig.topP,
    max_tokens: apiConfig.maxTokens,
    stream: true // 开启流式输出
  };

  logger.debug('Legacy Doubao stream request', requestData);

  try {
    const response = await fetch(apiConfig.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error?.message || '未知错误'}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      if (!value) continue;

      buffer += decoder.decode(value, { stream: true });
      
      // 按行解析 SSE 数据
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 最后一行可能不完整，保留到下次处理

      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // 跳过空行和注释
        if (!trimmedLine || trimmedLine.startsWith(':')) continue;

        // 解析 data: 行
        if (trimmedLine.startsWith('data: ')) {
          const data = trimmedLine.slice(6).trim();
          
          // 检查是否结束
          if (data === '[DONE]') {
            logger.info('Legacy Doubao stream completed');
            return;
          }

          try {
            const parsed: StreamDelta = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            
            if (content) {
              yield content; // 生成一个 token
            }
          } catch (e) {
            logger.warn('Legacy Doubao SSE parse failed', { data, error: e });
          }
        }
      }
    }

  } catch (error: any) {
    logger.error('Legacy Doubao stream API call failed', error);
    throw new Error(`与 AI 助手通信失败: ${error.message || '未知错误'}`);
  }
}
