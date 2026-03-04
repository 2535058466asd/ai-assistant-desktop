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

/**
 * 简单的发送消息到豆包函数
 */
export async function sendMessageToDoubao(
  userInput: string,
  history: Array<{ role: string; content: string }> = [],
  systemPrompt: string = ''
): Promise<string> {
  try {
    const messages: Message[] = [];

    // 添加系统提示词
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    // 添加历史消息
    messages.push(...history as Message[]);

    // 添加当前用户输入
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


