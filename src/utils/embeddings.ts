import { pinecone } from '../config/pinecone';
import logger from './logger';

/* ======================================================
   EMBEDDING (Pinecone Inference – BEST quality)
====================================================== */

const EMBEDDING_MODEL = 'deepseek-text-embedding-3.1';

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const result = await pinecone.inference.embed(
      EMBEDDING_MODEL,
      [text],
      { inputType: 'query', truncate: 'END' }
    );

    const embeddings = (result as any).data || result;
    return embeddings[0].values;
  } catch (error) {
    logger.error('Pinecone embedding error:', error);
    throw error;
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const BATCH_SIZE = 90;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);

      const result = await pinecone.inference.embed(
        EMBEDDING_MODEL,
        batch,
        { inputType: 'passage', truncate: 'END' }
      );

      const embeddings = (result as any).data || result;
      allEmbeddings.push(...embeddings.map((e: any) => e.values));
    }

    return allEmbeddings;
  } catch (error) {
    logger.error('Pinecone batch embedding error:', error);
    throw error;
  }
}

/* ======================================================
   MANUAL PDF INGESTION EXAMPLE
====================================================== */

export function chunkPdfText(
  text: string,
  chunkSize = 1200,
  overlap = 150
): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function ingestPdfTextToPinecone(
  indexName: string,
  pdfId: string,
  pdfText: string,
  metadata: {
    fileName: string;
    language?: string;
    category?: string;
  }
) {
  try {
    const index = pinecone.index(indexName);

    const chunks = chunkPdfText(pdfText);
    const vectors = await generateEmbeddings(chunks);

    const records = chunks.map((chunk, i) => ({
      id: `${pdfId}#${i}`,
      values: vectors[i],
      metadata: {
        ...metadata,
        chunkIndex: i,
        text: chunk,
      },
    }));

    await index.upsert(records);

    logger.info(
      `PDF ingested with DeepSeek 3.1 embeddings: ${metadata.fileName} (${records.length} chunks)`
    );
  } catch (error) {
    logger.error('PDF ingestion error:', error);
    throw error;
  }
}
