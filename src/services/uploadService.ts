import { supabase, BUCKET_NAME } from '../config/supabase';
import { parseDocument, ParsedDocument } from '../utils/documentParser';
import { chunkText, TextChunk } from '../utils/textChunker';
import { generateEmbeddings } from '../utils/embeddings';
import { getPineconeIndex } from '../config/pinecone';
import logger from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export interface UploadResult {
  success: boolean;
  fileName: string;
  chunksCount: number;
  message: string;
}

export async function uploadDocument(filePath: string, fileName: string): Promise<UploadResult> {
  try {
    // 1. Parse the document
    logger.log(`Parsing document: ${fileName}`);
    const parsedDoc = await parseDocument(filePath, fileName);

    // 2. Upload to Supabase storage
    logger.log(`Uploading to Supabase: ${fileName}`);
    const fileBuffer = await fs.readFile(filePath);
    const fileExt = path.extname(fileName);
    const uniqueFileName = `${Date.now()}-${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(uniqueFileName, fileBuffer, {
        contentType: fileExt === '.pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Supabase upload error: ${uploadError.message}`);
    }

    // 3. Chunk the text
    logger.log(`Chunking text for: ${fileName}`);
    const chunks = chunkText(parsedDoc.lines, fileName);

    // 4. Generate embeddings
    logger.log(`Generating embeddings for ${chunks.length} chunks...`);
    const chunkTexts = chunks.map(chunk => chunk.text);
    const embeddings = await generateEmbeddings(chunkTexts);

    // 5. Store in Pinecone
    logger.log(`Storing vectors in Pinecone...`);
    const index = await getPineconeIndex();

    const vectors = chunks.map((chunk, idx) => ({
      id: `${fileName}-chunk-${idx}`,
      values: embeddings[idx],
      metadata: {
        fileName: chunk.fileName,
        lineNumber: chunk.lineNumber.toString(),
        chunkIndex: chunk.chunkIndex.toString(),
        text: chunk.text,
      },
    }));

    // Batch upsert to avoid request size limits (Pinecone recommends batches of 100 or less)
    const BATCH_SIZE = 100;
    for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
      const batch = vectors.slice(i, i + BATCH_SIZE);
      await index.upsert(batch);
      logger.log(`Upserted batch ${i / BATCH_SIZE + 1} of ${Math.ceil(vectors.length / BATCH_SIZE)}`);
    }

    // Clean up temporary file
    await fs.unlink(filePath).catch(err => logger.error('Failed to delete temp file:', err));

    return {
      success: true,
      fileName,
      chunksCount: chunks.length,
      message: `Successfully uploaded and processed ${fileName}`,
    };
  } catch (error) {
    logger.error('Upload error:', error);
    // Clean up temporary file on error
    await fs.unlink(filePath).catch(err => logger.error('Failed to delete temp file:', err));

    return {
      success: false,
      fileName,
      chunksCount: 0,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

