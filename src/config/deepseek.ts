import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const DEEPSEEK_TOKEN = process.env.DEEPSEEK_TOKEN;
const DEEPSEEK_API_URL = 'https://api.modelarts-maas.com/v2/chat/completions';

if (!DEEPSEEK_TOKEN) {
  throw new Error('Missing DEEPSEEK_TOKEN. Please check your .env.local file.');
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chatWithDeepSeek(
  messages: ChatMessage[],
  temperature: number = 0.7
): Promise<string> {
  try {
    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: 'deepseek-v3.1',
        messages,
        temperature,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices[0]?.message?.content || 'No response from DeepSeek';
  } catch (error: any) {
    console.error('DeepSeek API Error:', error.response?.data || error.message);
    throw new Error(`DeepSeek API error: ${error.response?.data?.error?.message || error.message}`);
  }
}

