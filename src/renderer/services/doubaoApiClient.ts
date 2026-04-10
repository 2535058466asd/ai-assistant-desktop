import axios from 'axios';
import apiConfig from '../config/apiConfig';

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

    console.log('发送请求到豆包API:', JSON.stringify(requestData, null, 2));

    const response = await axios.post<DoubaoResponse>(apiConfig.apiUrl, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`,
      },
    });

    console.log('豆包API响应:', response.data);

    return response.data.choices[0].message.content;
  } catch (error: any) {
    console.error('豆包 API 调用失败:', error);
    if (error.response) {
      console.error('错误响应:', error.response.data);
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
 *   console.log(chunk); // 每次收到一个 token
 * }
 * ```
 * 
 * 或者使用回调模式：
 * ```typescript
 * await sendMessageToDoubaoStream('你好', [], '', {
 *   onChunk: (text) => console.log('收到:', text),
 *   onComplete: (fullText) => console.log('完成:', fullText)
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

  console.log('📤 发送流式请求到豆包API:', JSON.stringify(requestData, null, 2));

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
            console.log('✅ 流式传输完成');
            return;
          }

          try {
            const parsed: StreamDelta = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            
            if (content) {
              yield content; // 生成一个 token
            }
          } catch (e) {
            console.warn('⚠️ 解析 SSE 数据失败:', data, e);
          }
        }
      }
    }

  } catch (error: any) {
    console.error('❌ 豆包流式 API 调用失败:', error);
    throw new Error(`与 AI 助手通信失败: ${error.message || '未知错误'}`);
  }
}
