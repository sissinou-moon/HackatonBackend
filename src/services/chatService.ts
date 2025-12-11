import { chatWithDeepSeek, ChatMessage } from '../config/deepseek';
import { generateEmbedding } from '../utils/embeddings';
import { getPineconeIndex } from '../config/pinecone';

export interface ChatResponse {
  answer: string;
  sources: Array<{
    fileName: string;
    lineNumber: number;
    text: string;
  }>;
}

export async function chatWithDocuments(question: string, topK: number = 3): Promise<ChatResponse> {
  try {
    // 1. Generate embedding for the question
    console.log('Generating question embedding...');
    const questionEmbedding = await generateEmbedding(question);

    // 2. Search similar chunks in Pinecone
    console.log('Searching for relevant documents...');
    const index = await getPineconeIndex();

    const results = await index.query({
      vector: questionEmbedding,
      topK: topK,
      includeMetadata: true,
    });

    // 3. Extract relevant context
    const sources: ChatResponse['sources'] = [];
    const contexts: string[] = [];

    if (results.matches) {
      for (const match of results.matches) {
        if (match.metadata) {
          const fileName = match.metadata.fileName as string || 'Unknown';
          const lineNumber = parseInt(match.metadata.lineNumber as string || '0', 10);
          const document = match.metadata.text as string || '';

          sources.push({
            fileName,
            lineNumber,
            text: document.substring(0, 200) + '...', // Preview
          });

          contexts.push(`[From ${fileName}, line ${lineNumber}]: ${document}`);
        }
      }
    }

    // 4. Build prompt with context
    const contextText = contexts.join('\n\n');
    const systemPrompt = `You are a helpful assistant that answers questions based on the provided document context. 
Always cite the source file name and line number when referencing information from the documents.
If the answer cannot be found in the provided context, say so clearly.`;

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `Context from documents:\n\n${contextText}\n\nQuestion: ${question}\n\nPlease provide a detailed answer and mention the file name and line number for each piece of information you reference.`,
      },
    ];

    // 5. Get answer from DeepSeek
    console.log('Getting answer from DeepSeek...');
    const answer = await chatWithDeepSeek(messages);

    return {
      answer,
      sources,
    };
  } catch (error) {
    console.error('Chat error:', error);
    throw new Error(`Chat error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

