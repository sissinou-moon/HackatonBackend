import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

if (!process.env.PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY is not defined in .env.local');
}

export const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

export const INDEX_NAME = 'realdata';
export const INDEX_HOST = 'https://realdata-6wbd61w.svc.aped-4627-b74a.pinecone.io';

export async function getPineconeIndex() {
    const index = pinecone.index(INDEX_NAME, INDEX_HOST);
    return index;
}
