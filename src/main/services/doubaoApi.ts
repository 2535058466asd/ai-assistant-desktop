import axios from 'axios';

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
 * 豆包 API 服务
 */
export class DoubaoApiService {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey: string = 'your-api-key-here', apiUrl: string = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions') {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
  }

  /**
   * 发送消息到豆包 API
   * @param messages 消息列表
   * @returns AI 回复内容
   */
  async sendMessage(messages: Message[]): Promise<string> {
    try {
      const requestData: DoubaoRequest = {
        model: 'doubao-seed-2-0-lite-260215', // 使用用户指定的模型
        messages,
        temperature: 0.7,
        top_p: 0.95,
        max_tokens: 1024,
      };

      const response = await axios.post<DoubaoResponse>(this.apiUrl, requestData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('豆包 API 调用失败:', error);
      throw new Error('与 AI 助手通信失败，请稍后重试');
    }
  }

  /**
   * 生成对话历史格式的消息
   * @param userMessages 用户消息列表
   * @param assistantMessages 助手回复列表
   * @returns 格式化的消息列表
   */
  formatMessages(userMessages: string[], assistantMessages: string[]): Message[] {
    const messages: Message[] = [];

    // 添加系统消息
    messages.push({
      role: 'system',
      content: '你是一个智能 AI 助手，友好、专业，能够帮助用户解决各种问题。',
    });

    // 交替添加用户和助手消息
    const maxLength = Math.max(userMessages.length, assistantMessages.length);
    for (let i = 0; i < maxLength; i++) {
      if (i < userMessages.length) {
        messages.push({
          role: 'user',
          content: userMessages[i],
        });
      }
      if (i < assistantMessages.length) {
        messages.push({
          role: 'assistant',
          content: assistantMessages[i],
        });
      }
    }

    return messages;
  }
}

// 导出默认实例
export default new DoubaoApiService();
