import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs/promises';
import logger from './logger';

export interface ParsedDocument {
  text: string;
  lines: string[];
  metadata: {
    fileName: string;
    fileType: string;
    pageCount?: number;
  };
}

export async function parsePDF(filePath: string, fileName: string): Promise<ParsedDocument> {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const pdfData = await pdfParse(dataBuffer);
    
    const lines = pdfData.text.split('\n').filter((line: string) => line.trim().length > 0);
    
    return {
      text: pdfData.text,
      lines,
      metadata: {
        fileName,
        fileType: 'pdf',
        pageCount: pdfData.numpages,
      },
    };
  } catch (error) {
    logger.error('Error parsing PDF:', error);
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function parseWord(filePath: string, fileName: string): Promise<ParsedDocument> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value;
    
    const lines = text.split('\n').filter((line: string) => line.trim().length > 0);
    
    return {
      text,
      lines,
      metadata: {
        fileName,
        fileType: 'docx',
      },
    };
  } catch (error) {
    logger.error('Error parsing Word document:', error);
    throw new Error(`Failed to parse Word document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function parseDocument(filePath: string, fileName: string): Promise<ParsedDocument> {
  const extension = fileName.toLowerCase().split('.').pop();
  
  switch (extension) {
    case 'pdf':
      return parsePDF(filePath, fileName);
    case 'docx':
    case 'doc':
      return parseWord(filePath, fileName);
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}

