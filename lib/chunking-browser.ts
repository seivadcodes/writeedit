// lib/chunking-browser.ts
export function splitTextIntoChunks(text: string, maxWords = 600): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/);
    const wordCount = words.length;

    // If this paragraph alone exceeds limit, force-split it
    if (wordCount > maxWords) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [];
        currentWordCount = 0;
      }

      // Split long paragraph into sub-chunks
      let i = 0;
      while (i < words.length) {
        const slice = words.slice(i, i + maxWords).join(' ');
        chunks.push(slice);
        i += maxWords;
      }
      continue;
    }

    // Otherwise, try to add paragraph to current chunk
    if (currentWordCount + wordCount > maxWords && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
      currentChunk = [];
      currentWordCount = 0;
    }

    currentChunk.push(para);
    currentWordCount += wordCount;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n\n'));
  }

  return chunks;
}