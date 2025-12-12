import { chatWithDeepSeek, chatWithDeepSeekStream, ChatMessage } from '../config/deepseek';
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
    console.log('Processing your query...');
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

export async function chatWithDocumentsStream(
  question: string,
  res: any,
  topK: number = 3
): Promise<void> {
  try {
    // Setup response for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const sendSSE = (eventType: string, data: any) => {
      try {
        res.write(`event: ${eventType}\n`);
        if (typeof data === 'string') {
          res.write(`data: ${data}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
      } catch (e) {
        console.warn('Error sending SSE', e);
      }
    };

    // 1. Generate embedding for the question
    console.log('Generating question embedding (stream)...');
    sendSSE('step', { step: 'embedding', status: 'processing', label: 'Embedding query...' });
    
    const startTime = Date.now();
    const questionEmbedding = await generateEmbedding(question);
    const embeddingTime = Date.now() - startTime;
    
    console.log(`✓ Embedding completed in ${embeddingTime}ms`);
    sendSSE('step', { step: 'embedding', status: 'completed', label: 'Embedding query...', duration: embeddingTime });

    // 2. Search similar chunks in Pinecone
    console.log('Searching for relevant documents (stream)...');
    sendSSE('step', { step: 'retrieval', status: 'processing', label: 'Retrieving relevant chunks...' });
    
    const retrievalStart = Date.now();
    const index = await getPineconeIndex();

    const results = await index.query({
      vector: questionEmbedding,
      topK: topK,
      includeMetadata: true,
    });
    
    const retrievalTime = Date.now() - retrievalStart;
    console.log(`✓ Retrieved ${results.matches?.length || 0} chunks in ${retrievalTime}ms`);
    sendSSE('step', { step: 'retrieval', status: 'completed', label: 'Retrieving relevant chunks...', count: results.matches?.length || 0, duration: retrievalTime });

    // 3. Extract relevant context
    console.log('Extracting context from retrieved chunks...');
    sendSSE('step', { step: 'processing', status: 'processing', label: 'Processing chunks...' });
    
    const processingStart = Date.now();
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
            text: document.substring(0, 200) + '...',
          });

          contexts.push(`[From ${fileName}, line ${lineNumber}]: ${document}`);
        }
      }
    }
    
    const processingTime = Date.now() - processingStart;
    console.log(`✓ Processed ${sources.length} sources in ${processingTime}ms`);
    sendSSE('step', { step: 'processing', status: 'completed', label: 'Processing chunks...', count: sources.length, duration: processingTime });

    // 4. Build prompt with context
    const contextText = contexts.join('\n\n');
    const systemPrompt = `You are a helpful assistant that answers questions based on the provided document context. \nAlways cite the source file name and line number when referencing information from the documents.\nIf the answer cannot be found in the provided context, say so clearly.`;

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

    // 5. Stream answer from DeepSeek
    console.log('Starting DeepSeek streaming...');
    sendSSE('step', { step: 'generation', status: 'processing', label: 'Generating answer...' });

    const generationStart = Date.now();

    await chatWithDeepSeekStream(
      messages,
      (chunk) => {
        try {
          sendSSE('message', chunk);
        } catch (e) {
          console.warn('Error sending SSE chunk', e);
        }
      },
      () => {
        // On done, send step completion and sources
        const generationTime = Date.now() - generationStart;
        try {
          sendSSE('step', { step: 'generation', status: 'completed', label: 'Generating answer...', duration: generationTime });
          console.log(`✓ Answer generated in ${generationTime}ms`);
          
          sendSSE('done', { sources });
        } catch (e) {
          console.warn('Error sending final SSE', e);
        }
        res.end();
      }
    );
  } catch (error) {
    console.error('Chat stream error:', error);
    try {
      sendSSE('error', { message: error instanceof Error ? error.message : String(error) });
      res.end();
    } catch (e) {
      // ignore
      res.end();
    }
  }
}

