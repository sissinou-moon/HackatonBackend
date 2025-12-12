import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

if (!process.env.PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY is not defined in .env.local');
}

export const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

export const INDEX_NAME = process.env.PINECONE_INDEX_NAME || process.env.PINECONE_INDEX || 'realhackaton';

console.log('🔍 Pinecone Index Configuration:');
console.log('   PINECONE_INDEX_NAME:', process.env.PINECONE_INDEX_NAME);
console.log('   PINECONE_INDEX:', process.env.PINECONE_INDEX);
console.log('   → Using INDEX_NAME:', INDEX_NAME);

export async function getPineconeIndex() {
    console.log('📍 getPineconeIndex() called - Using index:', INDEX_NAME);
    const index = pinecone.index(INDEX_NAME);
    return index;
}
