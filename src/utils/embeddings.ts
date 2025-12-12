import { pinecone } from '../config/pinecone';

export async function generateEmbedding(text: string): Promise<number[]> {
  const primaryModel = 'Qwen3-Embedding-0.6B';
  const fallbackModel = 'llama-text-embed-v2';

  const callEmbed = async (modelName: string) => {
    const result = await pinecone.inference.embed(
      modelName,
      [text],
      { inputType: 'query', truncate: 'END' }
    );
    const embeddings = (result as any).data || result;
    return embeddings[0].values;
  };

  try {
    return await callEmbed(primaryModel);
  } catch (error: any) {
    console.warn(`Primary embedding model ${primaryModel} failed:`, error?.message || error);
    const errStr = String(error?.message || error || '');
    if (errStr.includes('404') || errStr.includes('NotFound') || errStr.includes('PineconeNotFoundError')) {
      try {
        console.log(`Falling back to embedding model ${fallbackModel}`);
        return await callEmbed(fallbackModel);
      } catch (err2) {
        console.error('Fallback embedding failed:', err2);
        throw err2;
      }
    }
    throw error;
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    // Pinecone inference supports batching
    const BATCH_SIZE = 90;
    const allEmbeddings: number[][] = [];
    const primaryModel = 'Qwen3-Embedding-0.6B';
    const fallbackModel = 'llama-text-embed-v2';

    const callEmbedBatch = async (modelName: string, batch: string[]) => {
      const result = await pinecone.inference.embed(
        modelName,
        batch,
        { inputType: 'passage', truncate: 'END' }
      );
      return (result as any).data || result;
    };

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      try {
        const embeddings = await callEmbedBatch(primaryModel, batch);
        allEmbeddings.push(...embeddings.map((e: any) => e.values));
      } catch (error: any) {
        console.warn(`Primary batch model ${primaryModel} failed:`, error?.message || error);
        const errStr = String(error?.message || error || '');
        if (errStr.includes('404') || errStr.includes('NotFound') || errStr.includes('PineconeNotFoundError')) {
          console.log(`Falling back to embedding model ${fallbackModel} for this batch`);
          const embeddings = await callEmbedBatch(fallbackModel, batch);
          allEmbeddings.push(...embeddings.map((e: any) => e.values));
        } else {
          console.error('Pinecone batch embedding error:', error);
          throw error;
        }
      }
    }

    return allEmbeddings;
  } catch (error) {
    console.error('Pinecone batch embedding error:', error);
    throw error;
  }
}
