/**
 * 启源 AI - 图片识别服务
 *
 * 调用豆包多模态API识别图片内容，提取文字和描述
 * 识别结果可导入 RAG 知识库
 */

import * as fs from 'fs';
import axios from 'axios';

// 豆包多模态API配置（从环境变量读取，不写死密钥）
const API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const API_KEY = process.env.VITE_DOUBAO_VISION_API_KEY || process.env.VITE_DOUBAO_API_KEY || '';
const VISION_MODEL = process.env.VITE_DOUBAO_VISION_MODEL || 'doubao-1-5-vision-pro-250328'; // 豆包视觉模型

/**
 * 识别图片内容
 * @param imagePath 图片文件路径
 * @param prompt 提示词（默认提取图片中的所有文字和关键信息）
 */
export async function recognizeImage(
  imagePath: string,
  prompt: string = '请详细描述这张图片的内容，提取图片中的所有文字信息、数据、参数等关键内容。如果有表格或列表，请用文本格式还原。'
): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    if (!fs.existsSync(imagePath)) {
      return { success: false, error: `图片不存在: ${imagePath}` };
    }

    // 读取图片并转为base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString('base64');

    // 判断图片MIME类型
    const ext = imagePath.toLowerCase();
    let mimeType = 'image/png';
    if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (ext.endsWith('.gif')) mimeType = 'image/gif';
    else if (ext.endsWith('.webp')) mimeType = 'image/webp';
    else if (ext.endsWith('.bmp')) mimeType = 'image/bmp';

    const response = await axios.post(
      API_URL,
      {
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
        max_tokens: 2048,
        temperature: 0.3, // 低温度，更精确
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        timeout: 30000,
      }
    );

    const text = response.data?.choices?.[0]?.message?.content;
    if (!text) {
      return { success: false, error: 'API返回内容为空' };
    }

    console.log(`🖼️ [图片识别] 成功识别图片: ${imagePath}`);
    return { success: true, text };
  } catch (error: any) {
    console.error(`🖼️ [图片识别] 失败:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 批量识别文件夹中的所有图片
 */
export async function recognizeImageBatch(
  dirPath: string,
  prompt?: string
): Promise<{ success: boolean; results?: Array<{ file: string; text: string }>; error?: string }> {
  try {
    if (!fs.existsSync(dirPath)) {
      return { success: false, error: `目录不存在: ${dirPath}` };
    }

    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const files = fs.readdirSync(dirPath).filter(f =>
      imageExts.some(ext => f.toLowerCase().endsWith(ext))
    );

    if (files.length === 0) {
      return { success: false, error: '目录中没有图片文件' };
    }

    const results: Array<{ file: string; text: string }> = [];

    for (const file of files) {
      const fullPath = dirPath + '/' + file;
      const result = await recognizeImage(fullPath, prompt);
      if (result.success && result.text) {
        results.push({ file, text: result.text });
      }
    }

    console.log(`🖼️ [图片识别] 批量识别完成: ${results.length}/${files.length} 成功`);
    return { success: true, results };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
