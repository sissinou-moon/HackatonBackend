import { chatWithDeepSeek, chatWithDeepSeekStream, ChatMessage } from '../config/deepseek';
import { generateEmbedding } from '../utils/embeddings';
import { getPineconeIndex } from '../config/pinecone';
import { refineQueryWithGhostPrompt, isQueryLikelyAmbiguous } from '../utils/ghostPrompt';
import { rerankDocuments, RetrievedDocument, getInitialRetrievalCount, getFinalResultCount } from '../utils/reranker';
import { checkCache, addToCache } from './cacheService';
import logger from '../utils/logger';
import {
  createQueryLog, startStep, endStep, finalizeQueryLog,
  markCacheHit, setRefinedQuery, QueryLog
} from '../utils/queryLogger';

export interface ChatResponse {
  answer: string;
  sources: Array<{
    fileName: string;
    lineNumber: number;
    text: string;
    score?: number;
  }>;
  queryLog?: {
    queryId: string;
    totalDuration: number;
    cacheHit: boolean;
    steps: Array<{ name: string; duration: number }>;
  };
}

export async function chatWithDocuments(question: string, topK: number = 10): Promise<ChatResponse> {
  const queryLog = createQueryLog(question);

  try {
    // ========== STEP 1: Ghost Prompt (Query Refinement) ==========
    let searchQuery = question;

    if (isQueryLikelyAmbiguous(question)) {
      const ghostStep = startStep(queryLog, 'Ghost Prompt (Query Refinement)');
      const refined = await refineQueryWithGhostPrompt(question);
      searchQuery = refined.refinedQuery;
      setRefinedQuery(queryLog, searchQuery);
      endStep(queryLog, ghostStep, {
        isAmbiguous: refined.isAmbiguous,
        intent: refined.intent,
        entities: refined.entities
      });
    }

    // ========== STEP 2: Generate Embedding ==========
    const embeddingStep = startStep(queryLog, 'Generate Embedding');
    const questionEmbedding = await generateEmbedding(searchQuery);
    endStep(queryLog, embeddingStep, { embeddingDimensions: questionEmbedding.length });

    // ========== STEP 3: Check Cache (Parallel with Retrieval) ==========
    const cacheStep = startStep(queryLog, 'Cache Check');
    const cachePromise = checkCache(questionEmbedding);

    // ========== STEP 4: Vector Search (Initial Retrieval of 20) ==========
    const retrievalStep = startStep(queryLog, 'Vector Search (Initial 20)');
    const index = await getPineconeIndex();
    const initialTopK = getInitialRetrievalCount();

    const resultsPromise = index.query({
      vector: questionEmbedding,
      topK: initialTopK,
      includeMetadata: true,
    });

    // Wait for both cache check and retrieval
    const [cachedResult, results] = await Promise.all([cachePromise, resultsPromise]);
    endStep(queryLog, cacheStep, { hit: !!cachedResult });

    // If cache hit, use cached results
    if (cachedResult) {
      markCacheHit(queryLog);
      endStep(queryLog, retrievalStep, { status: 'aborted - cache hit' });

      // Build response from cached results
      // Build response from cached results
      const sources = cachedResult.retrievalResults.map(doc => {
        const folder = doc.metadata.folder ? `${doc.metadata.folder}/` : '';
        const displayFileName = `${folder}${doc.metadata.fileName}`;
        return {
          fileName: displayFileName,
          lineNumber: parseInt(doc.metadata.lineNumber || '0', 10),
          text: doc.metadata.text.substring(0, 200) + '...',
          score: doc.finalScore
        };
      });

      const contexts = cachedResult.retrievalResults.map(doc => {
        const folder = doc.metadata.folder ? `${doc.metadata.folder}/` : '';
        const displayFileName = `${folder}${doc.metadata.fileName}`;
        return `[From ${displayFileName}, line ${doc.metadata.lineNumber}]: ${doc.metadata.text}`;
      });

      // Still need to call LLM for current question
      const llmStep = startStep(queryLog, 'LLM Response Generation');
      const answer = await generateLLMResponse(question, contexts);
      endStep(queryLog, llmStep);

      finalizeQueryLog(queryLog, sources.length);

      return {
        answer,
        sources,
        queryLog: buildQueryLogSummary(queryLog)
      };
    }

    endStep(queryLog, retrievalStep, { resultsCount: results.matches?.length || 0 });

    // ========== STEP 5: Convert to RetrievedDocument format ==========
    const documents: RetrievedDocument[] = (results.matches || []).map(match => ({
      id: match.id,
      score: match.score || 0,
      metadata: {
        fileName: (match.metadata?.fileName as string) || 'Unknown',
        lineNumber: (match.metadata?.lineNumber as string) || '0',
        text: (match.metadata?.text as string) || '',
        ...match.metadata
      }
    }));

    // ========== STEP 6: Rerank (20 → 10) ==========
    const rerankStep = startStep(queryLog, 'Reranking (20 → 10)');
    const rerankedDocs = rerankDocuments(searchQuery, documents, {
      finalResultCount: Math.min(topK, getFinalResultCount())
    });
    endStep(queryLog, rerankStep, {
      inputCount: documents.length,
      outputCount: rerankedDocs.length
    });

    // ========== STEP 7: Add to Cache ==========
    const cacheAddStep = startStep(queryLog, 'Add to Cache');
    addToCache(question, questionEmbedding, rerankedDocs);
    endStep(queryLog, cacheAddStep);

    // ========== STEP 8: Build Context ==========
    const sources: ChatResponse['sources'] = [];
    const contexts: string[] = [];

    for (const doc of rerankedDocs) {
      const folder = doc.metadata.folder ? `${doc.metadata.folder}/` : '';
      const displayFileName = `${folder}${doc.metadata.fileName}`;

      sources.push({
        fileName: displayFileName,
        lineNumber: parseInt(doc.metadata.lineNumber || '0', 10),
        text: doc.metadata.text.substring(0, 200) + '...',
        score: doc.finalScore
      });

      contexts.push(`[From ${displayFileName}, line ${doc.metadata.lineNumber}]: ${doc.metadata.text}`);
    }

    // ========== STEP 9: Generate LLM Response ==========
    const llmStep = startStep(queryLog, 'LLM Response Generation');
    const answer = await generateLLMResponse(question, contexts);
    endStep(queryLog, llmStep);

    finalizeQueryLog(queryLog, sources.length);

    return {
      answer,
      sources,
      queryLog: buildQueryLogSummary(queryLog)
    };
  } catch (error) {
    logger.error('Chat error:', error);
    finalizeQueryLog(queryLog, 0);
    throw new Error(`Chat error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function chatWithDocumentsStream(
  question: string,
  res: any,
  topK: number = 10
): Promise<void> {
  const queryLog = createQueryLog(question);

  try {
    // ========== STEP 1: Ghost Prompt (Query Refinement) ==========
    let searchQuery = question;

    if (isQueryLikelyAmbiguous(question)) {
      const ghostStep = startStep(queryLog, 'Ghost Prompt (Query Refinement)');
      const refined = await refineQueryWithGhostPrompt(question);
      searchQuery = refined.refinedQuery;
      setRefinedQuery(queryLog, searchQuery);
      endStep(queryLog, ghostStep, {
        isAmbiguous: refined.isAmbiguous,
        intent: refined.intent
      });
    }

    // ========== STEP 2: Generate Embedding ==========
    const embeddingStep = startStep(queryLog, 'Generate Embedding');
    const questionEmbedding = await generateEmbedding(searchQuery);
    endStep(queryLog, embeddingStep);

    // ========== STEP 3: Check Cache + Vector Search (Parallel) ==========
    const cacheStep = startStep(queryLog, 'Cache Check');
    const cachePromise = checkCache(questionEmbedding);

    const retrievalStep = startStep(queryLog, 'Vector Search (Initial 20)');
    const index = await getPineconeIndex();
    const initialTopK = getInitialRetrievalCount();

    const resultsPromise = index.query({
      vector: questionEmbedding,
      topK: initialTopK,
      includeMetadata: true,
    });

    const [cachedResult, results] = await Promise.all([cachePromise, resultsPromise]);
    endStep(queryLog, cacheStep, { hit: !!cachedResult });

    let sources: ChatResponse['sources'] = [];
    let contexts: string[] = [];

    if (cachedResult) {
      markCacheHit(queryLog);
      endStep(queryLog, retrievalStep, { status: 'aborted - cache hit' });

      sources = cachedResult.retrievalResults.map(doc => {
        const folder = doc.metadata.folder ? `${doc.metadata.folder}/` : '';
        const displayFileName = `${folder}${doc.metadata.fileName}`;
        return {
          fileName: displayFileName,
          lineNumber: parseInt(doc.metadata.lineNumber || '0', 10),
          text: doc.metadata.text.substring(0, 200) + '...',
          score: doc.finalScore
        };
      });

      contexts = cachedResult.retrievalResults.map(doc => {
        const folder = doc.metadata.folder ? `${doc.metadata.folder}/` : '';
        const displayFileName = `${folder}${doc.metadata.fileName}`;
        return `[From ${displayFileName}, line ${doc.metadata.lineNumber}]: ${doc.metadata.text}`;
      });
    } else {
      endStep(queryLog, retrievalStep, { resultsCount: results.matches?.length || 0 });

      // Convert and rerank
      const documents: RetrievedDocument[] = (results.matches || []).map(match => ({
        id: match.id,
        score: match.score || 0,
        metadata: {
          fileName: (match.metadata?.fileName as string) || 'Unknown',
          lineNumber: (match.metadata?.lineNumber as string) || '0',
          text: (match.metadata?.text as string) || '',
          ...match.metadata
        }
      }));

      const rerankStep = startStep(queryLog, 'Reranking (20 → 10)');
      const rerankedDocs = rerankDocuments(searchQuery, documents, {
        finalResultCount: Math.min(topK, getFinalResultCount())
      });
      endStep(queryLog, rerankStep, {
        inputCount: documents.length,
        outputCount: rerankedDocs.length
      });

      // Add to cache
      addToCache(question, questionEmbedding, rerankedDocs);

      for (const doc of rerankedDocs) {
        const folder = doc.metadata.folder ? `${doc.metadata.folder}/` : '';
        const displayFileName = `${folder}${doc.metadata.fileName}`;

        sources.push({
          fileName: displayFileName,
          lineNumber: parseInt(doc.metadata.lineNumber || '0', 10),
          text: doc.metadata.text.substring(0, 200) + '...',
          score: doc.finalScore
        });
        contexts.push(`[From ${displayFileName}, line ${doc.metadata.lineNumber}]: ${doc.metadata.text}`);
      }
    }

    // ========== STEP: Build prompt and stream ==========
    const contextText = contexts.join('\n\n');
    const systemPrompt = `You are a helpful assistant for Algerie Telecom that answers questions based on the provided document context. 
Always cite the source file name and line number when referencing information from the documents.
If the answer cannot be found in the provided context, say so clearly.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Context from documents:\n\n${contextText}\n\nQuestion: ${question}\n\nPlease provide a detailed answer and mention the file name and line number for each piece of information you reference.`,
      },
    ];

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const sendSSE = (data: string) => {
      // Send data directly, preserving all content including newlines
      // For SSE protocol, we escape newlines in the data
      const escaped = data.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
      res.write(`data: ${escaped}\n\n`);
    };

    const llmStep = startStep(queryLog, 'LLM Response Generation (Streaming)');

    await chatWithDeepSeekStream(
      messages,
      (chunk) => {
        try {
          sendSSE(chunk);
        } catch (e) {
          logger.warn('Error sending SSE chunk', e);
        }
      },
      () => {
        endStep(queryLog, llmStep);
        finalizeQueryLog(queryLog, sources.length);

        try {
          res.write(`event: done\n`);
          res.write(`data: ${JSON.stringify({
            sources,
            queryLog: buildQueryLogSummary(queryLog)
          })}\n\n`);
        } catch (e) {
          logger.warn('Error sending final SSE', e);
        }
        res.end();
      }
    );
  } catch (error) {
    logger.error('Chat stream error:', error);
    finalizeQueryLog(queryLog, 0);
    try {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message: error instanceof Error ? error.message : String(error) })}\n\n`);
      res.end();
    } catch (e) {
      res.end();
    }
  }
}

// Helper function to generate LLM response
async function generateLLMResponse(question: string, contexts: string[]): Promise<string> {
  const contextText = contexts.join('\n\n');
  const systemPrompt = `You are a helpful assistant for Algerie Telecom that answers questions based on the provided document context. 
Always cite the source file name and line number when referencing information from the documents.
If the answer cannot be found in the provided context, say so clearly.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Context from documents:\n\n${contextText}\n\nQuestion: ${question}\n\nPlease provide a detailed answer and mention the file name and line number for each piece of information you reference.`,
    },
  ];

  return await chatWithDeepSeek(messages);
}

// Helper to build query log summary for response
function buildQueryLogSummary(log: QueryLog) {
  return {
    queryId: log.queryId,
    totalDuration: log.totalDuration || 0,
    cacheHit: log.cacheHit,
    steps: log.steps.map(s => ({ name: s.name, duration: s.duration || 0 }))
  };
}
