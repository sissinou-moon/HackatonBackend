import { pinecone } from '../config/pinecone';

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const result = await pinecone.inference.embed(
      'llama-text-embed-v2',
      [text],
      { inputType: 'query', truncate: 'END' }
    );
    // Cast to any to handle type mismatch with EmbeddingsList, assuming .data structure or array
    const embeddings = (result as any).data || result;
    return embeddings[0].values;
  } catch (error) {
    console.error('Pinecone embedding error:', error);
    throw error;
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    // Pinecone inference supports batching
    const BATCH_SIZE = 90;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const result = await pinecone.inference.embed(
        'llama-text-embed-v2',
        batch,
        { inputType: 'passage', truncate: 'END' }
      );

      const embeddings = (result as any).data || result;
      allEmbeddings.push(...embeddings.map((e: any) => e.values));
    }

    return allEmbeddings;
  } catch (error) {
    console.error('Pinecone batch embedding error:', error);
    throw error;
  }
}
