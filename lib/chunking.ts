// lib/chunking.ts
/**
 * Smart text chunker that respects paragraph, speech, and chapter boundaries
 * Target: ~500 words per chunk with ±100 word tolerance
 * Never splits words, mid-speech blocks, or chapter headings
 * Chapters always start new chunks
 */

export function chunkText(text: string, targetWords: number = 500, tolerance: number = 100): string[] {
  // Normalize line endings and whitespace
  text = text.replace(/\r\n/g, '\n')
             .replace(/\n{3,}/g, '\n\n')
             .replace(/[ \t]+/g, ' ')
             .trim();

  if (!text) return [];

  // Helper to count words consistently
  function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  // Split into logical blocks (chapters, paragraphs, speeches)
  const blocks = splitIntoLogicalBlocks(text);
  
  // Group blocks into chunks
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const block of blocks) {
    // CHAPTER HANDLING: Always start new chunk at chapter boundaries
    if (block.type === 'chapter') {
      // Flush existing chunk content
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [];
        currentWordCount = 0;
      }
      
      // Handle oversized chapter headings (rare but possible)
      const chapterWords = countWords(block.content);
      if (chapterWords > targetWords + tolerance) {
        chunks.push(block.content);
      } else {
        currentChunk = [block.content];
        currentWordCount = chapterWords;
      }
      continue;
    }

    // Handle non-chapter blocks
    const blockWords = countWords(block.content);
    
    // Handle oversized blocks (e.g., long speeches/paragraphs)
    if (blockWords > targetWords + tolerance) {
      // Flush current chunk before oversized content
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [];
        currentWordCount = 0;
      }
      
      // Special handling by block type
      if (block.type === 'speech') {
        chunks.push(...splitSpeechBlock(block.content, targetWords, tolerance));
      } 
      else if (block.type === 'paragraph') {
        chunks.push(...splitParagraphBlock(block.content, targetWords, tolerance));
      } 
      else {
        chunks.push(block.content); // Fallback for unknown types
      }
      continue;
    }

    // Start new chunk if adding this block would exceed tolerance
    if (currentWordCount + blockWords > targetWords + tolerance && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
      currentChunk = [];
      currentWordCount = 0;
    }

    // Add block to current chunk
    currentChunk.push(block.content);
    currentWordCount += blockWords;
  }

  // Flush remaining content
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n\n'));
  }

  // Balance chunks (prevent tiny last chunk)
  return balanceChunks(chunks, targetWords, tolerance);
}

/**
 * Splits text into logical blocks while preserving structure
 * Detects: chapters, paragraphs, speeches
 */
function splitIntoLogicalBlocks(text: string): { type: string; content: string }[] {
  // First split by paragraph breaks
  const rawBlocks = text.split(/\n\n+/)
                        .map(block => block.trim())
                        .filter(block => block.length > 0);
  
  const blocks: { type: string; content: string }[] = [];
  
  // Enhanced chapter patterns that handle word-based numbers and various formats
  const chapterPatterns = [
    // Standard chapter formats
    /^\s*chapter\s+\d+/i,
    /^\s*chapter\s+[ivxlcdm]+\b/i,  // Roman numerals
    
    // Word-based chapter numbers (e.g., "Chapter Twenty-Five", "Chapter five")
    /^\s*chapter\s+(?:[a-z]+(?:-[a-z]+)*)/i,
    
    // Combined word/number patterns (e.g., "Chapter 5: The Beginning")
    /^\s*chapter\s+(?:\d+|[a-z]+(?:-[a-z]+)*)\s*[:\-]?\s*[a-z,'"\s-]{0,40}$/i,
    
    // Alternative chapter indicators
    /^\s*part\s+\d+/i,
    /^\s*section\s+\d+/i,
    
    // Common heading formats
    /^\s*prologue\b/i,
    /^\s*epilogue\b/i,
    /^\s*appendix\b/i,
    
    // Book-specific sections
    /^\s*preface\b/i,
    /^\s*foreword\b/i,
    /^\s*introduction\b/i,
    /^\s*afterword\b/i,
    /^\s*acknowledgments\b/i,
    /^\s*bibliography\b/i,
    /^\s*index\b/i,
    
    // All-caps short headings (extended to handle hyphenated words and longer titles)
    /^\s*[A-Z0-9\s,'-]{3,60}\s*$/,
    
    // Title case headings with reasonable length (catches "Chapter Twenty Five")
    /^\s*(?:Chapter|Part|Section|Volume|Book)\s+[A-Z][a-z]*(?:\s+[A-Z][a-z'-]*){0,5}$/i
  ];

  for (const block of rawBlocks) {
    // Skip empty blocks
    if (!block.trim()) continue;

    // CHAPTER DETECTION: Single-line blocks matching heading patterns
    if (!block.includes('\n')) {  // Only check single-line blocks
      const isChapter = chapterPatterns.some(pattern => pattern.test(block));
      if (isChapter) {
        blocks.push({ type: 'chapter', content: block });
        continue;
      }
    }

    // SPEECH DETECTION: Blocks starting/ending with quote characters
    const trimmed = block.trim();
    const startChar = trimmed[0];
    const endChar = trimmed[trimmed.length - 1];
    const openQuotes = ['"', '“', '‘', '«', '‟', '‛'];
    const closeQuotes = ['"', '”', '’', '»', '‟', '‛'];
    
    if (openQuotes.includes(startChar) && closeQuotes.includes(endChar)) {
      blocks.push({ type: 'speech', content: block });
    } 
    // Default to paragraph
    else {
      blocks.push({ type: 'paragraph', content: block });
    }
  }

  return blocks;
}

/**
 * Splits a speech block while preserving quote integrity
 */
function splitSpeechBlock(speech: string, targetWords: number, tolerance: number): string[] {
  // Split at natural speech breaks (sentence endings + quotes)
  const sentences = speech.match(/[^.!?]+[.!?]+"?/g) || [speech];
  return assembleChunks(sentences, targetWords, tolerance, true);
}

/**
 * Splits a paragraph at sentence boundaries
 */
function splitParagraphBlock(paragraph: string, targetWords: number, tolerance: number): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
  return assembleChunks(sentences, targetWords, tolerance, false);
}

/**
 * Assembles chunks from fragments with balancing
 */
function assembleChunks(
  fragments: string[], 
  targetWords: number, 
  tolerance: number,
  preserveQuotes: boolean
): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  let currentWordCount = 0;

  for (const fragment of fragments) {
    const fragmentWords = fragment.trim().split(/\s+/).filter(Boolean).length;
    
    // Start new chunk if needed
    if (currentWordCount + fragmentWords > targetWords + tolerance && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
      currentWordCount = 0;
    }

    // Add fragment with proper spacing
    const separator = currentChunk ? (preserveQuotes && !currentChunk.endsWith('"') ? ' ' : ' ') : '';
    currentChunk += separator + fragment;
    currentWordCount += fragmentWords;
  }

  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

/**
 * Balances chunks to prevent very small last chunks
 */
function balanceChunks(chunks: string[], targetWords: number, tolerance: number): string[] {
  if (chunks.length < 2) return chunks;

  function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  const lastChunk = chunks[chunks.length - 1];
  const lastWordCount = countWords(lastChunk);

  // Merge with previous chunk if too small
  if (lastWordCount < targetWords - tolerance) {
    const prevChunk = chunks[chunks.length - 2];
    const combined = prevChunk + '\n\n' + lastChunk;
    const combinedWords = countWords(combined);
    
    // Only merge if combined chunk isn't too large
    if (combinedWords <= targetWords + tolerance * 1.5) {
      chunks[chunks.length - 2] = combined;
      chunks.pop();
    }
  }

  return chunks;
}