export interface TextChunk {
  text: string;
  fileName: string;
  lineNumber: number;
  chunkIndex: number;
}

export function chunkText(
  lines: string[],
  fileName: string,
  chunkSize: number = 500,
  overlap: number = 50
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;
  let chunkIndex = 0;
  let lineNumber = 1;

  for (const line of lines) {
    const lineLength = line.length;
    
    if (currentLength + lineLength > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        text: currentChunk.join('\n'),
        fileName,
        lineNumber: lineNumber - currentChunk.length,
        chunkIndex: chunkIndex++,
      });

      // Start new chunk with overlap
      const overlapLines = currentChunk.slice(-Math.ceil(overlap / 50));
      currentChunk = [...overlapLines, line];
      currentLength = overlapLines.join('\n').length + lineLength;
    } else {
      currentChunk.push(line);
      currentLength += lineLength + 1; // +1 for newline
    }
    
    lineNumber++;
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.join('\n'),
      fileName,
      lineNumber: lineNumber - currentChunk.length,
      chunkIndex: chunkIndex,
    });
  }

  return chunks;
}

