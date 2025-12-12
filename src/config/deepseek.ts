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
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_TOKEN}`,
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

// Stream-supporting wrapper. Calls `onChunk` for each raw chunk received from DeepSeek.
export async function chatWithDeepSeekStream(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  onDone?: () => void,
  temperature: number = 0.7
): Promise<void> {
  try {
    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: 'deepseek-v3.1',
        messages,
        temperature,
        stream: true,
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        responseType: 'stream',
      }
    );

    const stream = response.data;

    let buffer = '';

    const findMatchingBrace = (s: string, start: number) => {
      let depth = 0;
      for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) return i;
        }
      }
      return -1;
    };

    stream.on('data', (chunk: any) => {
      try {
        buffer += chunk.toString();

        // Process as many complete messages as available
        while (true) {
          const dataIndex = buffer.indexOf('data:');
          const braceIndex = buffer.indexOf('{');

          if (dataIndex === -1 && braceIndex === -1) break;

          // Prefer SSE-style 'data:' entries when present
          const startIdx = dataIndex !== -1 ? dataIndex + 5 : braceIndex;
          const jsonStart = buffer.indexOf('{', startIdx);
          if (jsonStart === -1) break; // incomplete

          const jsonEnd = findMatchingBrace(buffer, jsonStart);
          if (jsonEnd === -1) break; // incomplete

          const jsonStr = buffer.slice(jsonStart, jsonEnd + 1);
          // Remove processed part from buffer
          buffer = buffer.slice(jsonEnd + 1);

          // Trim possible prefixes like "data:\n"
          let parsed: any;
          try {
            parsed = JSON.parse(jsonStr);
          } catch (e) {
            // if parse fails, continue to next
            console.warn('Failed to parse JSON chunk from DeepSeek stream', e);
            continue;
          }

          // Handle special done marker
          if (typeof parsed === 'string' && parsed === '[DONE]') {
            if (onDone) onDone();
            continue;
          }

          // Typical response has choices array with deltas
          const choices = parsed?.choices;
          if (Array.isArray(choices)) {
            for (const choice of choices) {
              // Some chunks only contain finish info
              if (choice?.delta?.content) {
                onChunk(choice.delta.content);
              }
              if (choice?.finish_reason) {
                // If model finished, call onDone
                if (choice.finish_reason === 'stop' && onDone) onDone();
              }
            }
          } else {
            // If it's a final object with usage or other metadata, call onDone
            if (parsed?.usage || parsed?.id) {
              if (onDone) onDone();
            }
          }
        }
      } catch (e) {
        console.warn('Error processing DeepSeek chunk', e);
      }
    });

    stream.on('end', () => {
      if (onDone) onDone();
    });

    stream.on('error', (err: any) => {
      console.error('DeepSeek stream error:', err);
      if (onDone) onDone();
    });
  } catch (error: any) {
    console.error('DeepSeek streaming error:', error.response?.data || error.message);
    throw new Error(`DeepSeek streaming error: ${error.response?.data?.error?.message || error.message}`);
  }
}

