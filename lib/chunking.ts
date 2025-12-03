// lib/chunking.ts

/**
 * Splits a long text into chunks of paragraphs or sentences,
 * aiming for ~500 words per chunk without breaking meaning.
 */
export function splitIntoChunks(text: string, maxWordsPerChunk = 500): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/);
    const wordCount = words.length;

    // If paragraph is huge, split into sentences
    if (wordCount > maxWordsPerChunk) {
      // Flush current chunk if it has content
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [];
        currentWordCount = 0;
      }

      // Split paragraph into sentences
      const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
      let tempChunk: string[] = [];
      let tempWordCount = 0;

      for (const sent of sentences) {
        const sentWords = sent.trim().split(/\s+/).length;
        if (tempWordCount + sentWords > maxWordsPerChunk && tempChunk.length > 0) {
          chunks.push(tempChunk.join(' '));
          tempChunk = [];
          tempWordCount = 0;
        }
        tempChunk.push(sent.trim());
        tempWordCount += sentWords;
      }

      if (tempChunk.length > 0) {
        chunks.push(tempChunk.join(' '));
      }
    } else {
      // Add paragraph to current chunk, or start new one
      if (currentWordCount + wordCount > maxWordsPerChunk && currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [];
        currentWordCount = 0;
      }
      currentChunk.push(para.trim());
      currentWordCount += wordCount;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n\n'));
  }

  return chunks;
}