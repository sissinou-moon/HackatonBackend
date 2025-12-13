import express, { Request, Response } from 'express';
import { generateEmbedding } from '../utils/embeddings';
import { getPineconeIndex } from '../config/pinecone';
import logger from '../utils/logger';

const router = express.Router();

interface SearchResult {
    fileName: string;
    folder?: string;
    displayPath: string;
    matches: {
        text: string;
        lineNumber: number;
        score: number;
    }[];
}

/**
 * POST /api/search
 * Semantic search across documents
 * Body: { "query": "search phrase", "topK": 20 }
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const { query, topK = 20 } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Query string is required',
            });
        }

        logger.log(`🔍 Searching for: "${query}"`);

        // 1. Generate embedding for the query
        const embedding = await generateEmbedding(query);

        // 2. Query Pinecone
        const index = await getPineconeIndex();
        const results = await index.query({
            vector: embedding,
            topK: topK,
            includeMetadata: true,
        });

        if (!results.matches || results.matches.length === 0) {
            return res.json({
                success: true,
                message: 'No relevant documents found.',
                results: []
            });
        }

        // 3. Process and group results
        // Types for Pinecone metadata
        interface ChunkMetadata {
            fileName: string;
            text: string;
            lineNumber: string | number;
            folder?: string;
            [key: string]: any;
        }

        const groupedResults: Record<string, SearchResult> = {};
        const RELEVANCE_THRESHOLD = 0.40; // Filter low relevance results

        for (const match of results.matches) {
            if (!match.score || match.score < RELEVANCE_THRESHOLD) continue;

            const metadata = match.metadata as unknown as ChunkMetadata;
            if (!metadata) continue;

            const fileName = metadata.fileName || 'Unknown';
            const folder = metadata.folder || '';
            const displayPath = folder ? `${folder}/${fileName}` : fileName;

            // Generate a unique key for grouping (using path)
            const fileKey = displayPath;

            if (!groupedResults[fileKey]) {
                groupedResults[fileKey] = {
                    fileName,
                    folder: folder || undefined,
                    displayPath,
                    matches: []
                };
            }

            groupedResults[fileKey].matches.push({
                text: metadata.text,
                lineNumber: Number(metadata.lineNumber) || 0,
                score: match.score
            });
        }

        // Convert map to array and sort matches by line number
        const formattedResults = Object.values(groupedResults).map(fileResult => ({
            ...fileResult,
            matches: fileResult.matches.sort((a, b) => a.lineNumber - b.lineNumber)
        }));

        res.json({
            success: true,
            query,
            count: formattedResults.length,
            results: formattedResults
        });

    } catch (error) {
        logger.error('Search API error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
    }
});

export default router;
