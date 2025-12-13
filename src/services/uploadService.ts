import { supabaseAdmin, BUCKET_NAME } from '../config/supabase';
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
  folder?: string;
  storagePath?: string;
  chunksCount: number;
  message: string;
}

function sanitizeFileName(filename: string): string {
  // Remove accents (é → e, ç → c…)
  const noAccents = filename.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Replace all invalid characters with "_"
  const clean = noAccents.replace(/[^a-zA-Z0-9._-]/g, "_");
  return clean;
}

function sanitizeFolderName(folderName: string): string {
  // Remove accents and invalid characters, allow only alphanumeric, underscore, hyphen
  const noAccents = folderName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const clean = noAccents.replace(/[^a-zA-Z0-9_-]/g, "_");
  // Remove leading/trailing underscores
  return clean.replace(/^_+|_+$/g, "");
}

export async function uploadDocument(
  filePath: string,
  fileName: string,
  folderName?: string
): Promise<UploadResult> {
  try {
    // --- Sanitize filename BEFORE any logic ---
    const safeFileName = sanitizeFileName(fileName);
    const uniqueFileName = `${Date.now()}-${safeFileName}`;
    const fileExt = path.extname(safeFileName);

    // Sanitize folder name if provided
    const safeFolder = folderName ? sanitizeFolderName(folderName) : undefined;

    // Build the storage path: folder/uniqueFileName or just uniqueFileName
    const storagePath = safeFolder
      ? `${safeFolder}/${uniqueFileName}`
      : uniqueFileName;

    // 1. Parse the document
    logger.log(`Parsing document: ${safeFileName}`);
    const parsedDoc = await parseDocument(filePath, safeFileName);

    // 2. Upload to Supabase storage
    logger.log(`Uploading to Supabase: ${storagePath}`);
    const fileBuffer = await fs.readFile(filePath);

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: fileExt === '.pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Supabase upload error: ${uploadError.message}`);
    }

    // 3. Chunk the text
    logger.log(`Chunking text for: ${safeFileName}`);
    const chunks = chunkText(parsedDoc.lines, safeFileName);

    // 4. Generate embeddings
    logger.log(`Generating embeddings for ${chunks.length} chunks...`);
    const chunkTexts = chunks.map(chunk => chunk.text);
    const embeddings = await generateEmbeddings(chunkTexts);

    // 5. Store in Pinecone
    logger.log(`Storing vectors in Pinecone...`);
    const index = await getPineconeIndex();

    const vectors = chunks.map((chunk, idx) => ({
      id: `${storagePath}-chunk-${idx}`, // Use storage path for unique ID including folder
      values: embeddings[idx],
      metadata: {
        fileName: chunk.fileName,
        folder: safeFolder || "",
        storagePath: storagePath,
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
      fileName: safeFileName,
      folder: safeFolder,
      storagePath: storagePath,
      chunksCount: chunks.length,
      message: `Successfully uploaded and processed ${safeFileName}${safeFolder ? ` in folder "${safeFolder}"` : ""}`,
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

/**
 * Upload document to Pinecone only (skip Supabase storage)
 * Useful for re-indexing documents that are already stored elsewhere
 */
export async function uploadToPineconeOnly(
  filePath: string,
  fileName: string,
  folderName?: string
): Promise<UploadResult> {
  try {
    // --- Sanitize filename BEFORE any logic ---
    const safeFileName = sanitizeFileName(fileName);
    const uniqueFileName = `${Date.now()}-${safeFileName}`;

    // Sanitize folder name if provided
    const safeFolder = folderName ? sanitizeFolderName(folderName) : undefined;

    // Build a reference path (not actually stored in Supabase)
    const referencePath = safeFolder
      ? `${safeFolder}/${uniqueFileName}`
      : uniqueFileName;

    // 1. Parse the document
    logger.log(`[Pinecone Only] Parsing document: ${safeFileName}`);
    const parsedDoc = await parseDocument(filePath, safeFileName);

    // 2. Chunk the text
    logger.log(`[Pinecone Only] Chunking text for: ${safeFileName}`);
    const chunks = chunkText(parsedDoc.lines, safeFileName);

    // 3. Generate embeddings
    logger.log(`[Pinecone Only] Generating embeddings for ${chunks.length} chunks...`);
    const chunkTexts = chunks.map(chunk => chunk.text);
    const embeddings = await generateEmbeddings(chunkTexts);

    // 4. Store in Pinecone
    logger.log(`[Pinecone Only] Storing vectors in Pinecone...`);
    const index = await getPineconeIndex();

    const vectors = chunks.map((chunk, idx) => ({
      id: `${referencePath}-chunk-${idx}`,
      values: embeddings[idx],
      metadata: {
        fileName: chunk.fileName,
        folder: safeFolder || "",
        storagePath: referencePath, // Reference path, not actual Supabase path
        lineNumber: chunk.lineNumber.toString(),
        chunkIndex: chunk.chunkIndex.toString(),
        text: chunk.text,
        pineconeOnly: "true", // Flag to indicate this wasn't stored in Supabase
      },
    }));

    // Batch upsert to avoid request size limits
    const BATCH_SIZE = 100;
    for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
      const batch = vectors.slice(i, i + BATCH_SIZE);
      await index.upsert(batch);
      logger.log(`[Pinecone Only] Upserted batch ${i / BATCH_SIZE + 1} of ${Math.ceil(vectors.length / BATCH_SIZE)}`);
    }

    // Clean up temporary file
    await fs.unlink(filePath).catch(err => logger.error('Failed to delete temp file:', err));

    return {
      success: true,
      fileName: safeFileName,
      folder: safeFolder,
      storagePath: referencePath,
      chunksCount: chunks.length,
      message: `Successfully indexed ${safeFileName} in Pinecone (Supabase storage skipped)${safeFolder ? ` with folder "${safeFolder}"` : ""}`,
    };
  } catch (error) {
    logger.error('[Pinecone Only] Upload error:', error);
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
