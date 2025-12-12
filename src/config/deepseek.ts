import axios from 'axios';
import dotenv from 'dotenv';
import logger from '../utils/logger';

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
    const requestBody = {
      model: 'deepseek-v3.1',
      messages,
      temperature,
      stream: false,
    };
    logger.log('DeepSeek Request:', JSON.stringify(requestBody, null, 2));

    const response = await axios.post(
      DEEPSEEK_API_URL,
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.log('DeepSeek Response Status:', response.status);
    logger.log('DeepSeek Response Headers:', JSON.stringify(response.headers, null, 2));
    logger.log('DeepSeek Response Data:', JSON.stringify(response.data, null, 2));

    return response.data.choices[0]?.message?.content || 'No response from DeepSeek';
  } catch (error: any) {
    logger.error('DeepSeek API Error:', error.response?.data || error.message);
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
    const requestBody = {
      model: 'deepseek-v3.1',
      messages,
      temperature,
      seed: 42,
      stream: true,
    };
    logger.log('DeepSeek Stream Request:', JSON.stringify(requestBody, null, 2));

    const response = await axios.post(
      DEEPSEEK_API_URL,
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        responseType: 'stream',
      }
    );

    logger.log('DeepSeek Stream Response Status:', response.status);
    logger.log('DeepSeek Stream Headers:', JSON.stringify(response.headers, null, 2));

    const stream = response.data;

    let buffer = '';
    let fullContent = '';

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
      logger.log('DeepSeek Stream Raw Chunk:', chunk.toString());
      try {
        buffer += chunk.toString();

        // Process as many complete messages as available
        while (true) {
          buffer = buffer.trimStart();
          if (!buffer) break;

          if (buffer.startsWith('data: [DONE]')) {
            if (onDone) onDone();
            buffer = buffer.slice(12);
            continue;
          }

          let jsonStart = -1;
          if (buffer.startsWith('data:')) {
            jsonStart = buffer.indexOf('{');
            if (jsonStart === -1) {
              // If we have a newline but no '{', it's a garbage line
              if (buffer.includes('\n')) {
                buffer = buffer.slice(buffer.indexOf('\n') + 1);
                continue;
              }
              break; // Wait for more data
            }
          } else if (buffer.startsWith('{')) {
            jsonStart = 0;
          } else {
            // Garbage or unknown format, skip line
            const newline = buffer.indexOf('\n');
            if (newline === -1) break;
            buffer = buffer.slice(newline + 1);
            continue;
          }

          const jsonEnd = findMatchingBrace(buffer, jsonStart);
          if (jsonEnd === -1) break; // incomplete

          const jsonStr = buffer.slice(jsonStart, jsonEnd + 1);
          buffer = buffer.slice(jsonEnd + 1);

          let parsed: any;
          try {
            parsed = JSON.parse(jsonStr);
            // console.log('DeepSeek Stream Parsed Chunk:', JSON.stringify(parsed, null, 2));
          } catch (e) {
            logger.warn('Failed to parse JSON chunk from DeepSeek stream', e);
            continue;
          }

          // Typical response has choices array with deltas
          const choices = parsed?.choices;
          if (Array.isArray(choices)) {
            for (const choice of choices) {
              if (choice?.delta?.content) {
                const content = choice.delta.content;
                fullContent += content;
                onChunk(content);
              }
              if (choice?.finish_reason) {
                if (choice.finish_reason === 'stop' && onDone) onDone();
              }
            }
          } else {
            if (parsed?.usage || parsed?.id) {
              if (onDone) onDone();
            }
          }
        }
      } catch (e) {
        logger.warn('Error processing DeepSeek chunk', e);
      }
    });

    stream.on('end', () => {
      logger.log('DeepSeek Stream Full Response (Accumulated):', fullContent);
      if (onDone) onDone();
    });

    stream.on('error', (err: any) => {
      logger.error('DeepSeek stream error:', err);
      if (onDone) onDone();
    });
  } catch (error: any) {
    logger.error('DeepSeek streaming error:', error.response?.data || error.message);
    throw new Error(`DeepSeek streaming error: ${error.response?.data?.error?.message || error.message}`);
  }
}

