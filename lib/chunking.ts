// lib/chunking.ts
/**
 * Smart text chunker that respects paragraph and speech boundaries
 * Target: ~500 words per chunk with ±100 word tolerance
 * Never splits words or mid-speech blocks
 */

// 👇 MUST EXPORT the function!
export function chunkText(text: string, targetWords: number = 500, tolerance: number = 100): string[] {
  // Normalize line endings and whitespace
  text = text.replace(/\r\n/g, '\n')
             .replace(/\n{3,}/g, '\n\n')
             .replace(/[ \t]+/g, ' ')
             .trim();

  if (!text) return [];

  // Split into logical blocks (paragraphs, speeches, etc.)
  const blocks = splitIntoLogicalBlocks(text);
  
  // Group blocks into chunks
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const block of blocks) {
    const blockWords = countWords(block.content);
    
    // Handle oversized blocks (e.g., long speeches)
    if (blockWords > targetWords + tolerance) {
      flushCurrentChunk();
      
      // Special handling for speech blocks
      if (block.type === 'speech') {
        chunks.push(...splitSpeechBlock(block.content, targetWords, tolerance));
      } 
      // Handle regular oversized paragraphs
      else if (block.type === 'paragraph') {
        chunks.push(...splitParagraphBlock(block.content, targetWords, tolerance));
      } 
      // Fallback for other block types
      else {
        chunks.push(block.content);
      }
      continue;
    }

    // Check if adding this block exceeds chunk size
    if (currentWordCount + blockWords > targetWords + tolerance && currentChunk.length > 0) {
      flushCurrentChunk();
    }

    currentChunk.push(block.content);
    currentWordCount += blockWords;
  }

  // Flush remaining content
  flushCurrentChunk();

  // Balance chunks (prevent tiny last chunk)
  return balanceChunks(chunks, targetWords, tolerance);

  // Helper functions
  function flushCurrentChunk() {
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
      currentChunk = [];
      currentWordCount = 0;
    }
  }

  function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }
}

/**
 * Splits text into logical blocks while preserving structure
 * Identifies: paragraphs, speeches, poetry, lists, etc.
 */
function splitIntoLogicalBlocks(text: string): { type: string; content: string }[] {
  const blocks: { type: string; content: string }[] = [];
  let currentBlock = '';
  let blockType = 'paragraph';
  let inSpeech = false;
  let speechQuote = '';

  // Process character by character to detect block types
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1] || '';
    const prevChar = text[i - 1] || '';

    // Detect speech blocks (handles multiple quote styles)
    if ((char === '"' || char === "'" || char === '“' || char === '”' || char === '‘' || char === '’') && 
        !inSpeech && 
        (prevChar === '\n' || prevChar === ' ' || prevChar === '')) {
      if (currentBlock.trim()) {
        blocks.push({ type: blockType, content: currentBlock.trim() });
        currentBlock = '';
      }
      inSpeech = true;
      speechQuote = char;
      blockType = 'speech';
    } 
    // End of speech block
    else if (inSpeech && char === speechQuote && 
             (nextChar === '\n' || nextChar === ' ' || nextChar === '' || nextChar === ',' || nextChar === '.')) {
      currentBlock += char;
      blocks.push({ type: 'speech', content: currentBlock.trim() });
      currentBlock = '';
      inSpeech = false;
      blockType = 'paragraph';
      continue;
    }

    // Paragraph separator (two+ newlines)
    if (char === '\n' && nextChar === '\n') {
      if (currentBlock.trim()) {
        blocks.push({ type: blockType, content: currentBlock.trim() });
        currentBlock = '';
        blockType = 'paragraph';
      }
      i++; // Skip next newline
      continue;
    }

    currentBlock += char;
  }

  // Add final block
  if (currentBlock.trim()) {
    blocks.push({ type: blockType, content: currentBlock.trim() });
  }

  return blocks;
}

/**
 * Splits a speech block while preserving quote integrity
 */
function splitSpeechBlock(speech: string, targetWords: number, tolerance: number): string[] {
  // Try to find natural break points within speech
  const sentences = speech.match(/[^.!?]+[.!?]+["']?/g) || [speech];
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
 * Assembles chunks from sentence fragments with balancing
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

  for (let i = 0; i < fragments.length; i++) {
    const fragment = fragments[i];
    const fragmentWords = fragment.trim().split(/\s+/).filter(Boolean).length;
    
    // Check if adding would exceed tolerance
    if (currentWordCount + fragmentWords > targetWords + tolerance && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
      currentWordCount = 0;
    }

    // Preserve quote integrity for speech chunks
    if (preserveQuotes && currentChunk && !currentChunk.endsWith('"') && !currentChunk.endsWith('”')) {
      currentChunk += ' ';
    }
    
    currentChunk += (currentChunk ? ' ' : '') + fragment;
    currentWordCount += fragmentWords;
  }

  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

/**
 * Balances chunks to prevent very small last chunk
 */
function balanceChunks(chunks: string[], targetWords: number, tolerance: number): string[] {
  if (chunks.length < 2) return chunks;

  const lastChunk = chunks[chunks.length - 1];
  const lastWordCount = lastChunk.trim().split(/\s+/).filter(Boolean).length;

  // If last chunk is too small, merge with previous
  if (lastWordCount < targetWords - tolerance) {
    const prevChunk = chunks[chunks.length - 2];
    const combined = prevChunk + '\n\n' + lastChunk;
    
    // Only merge if combined isn't too big
    if (countWords(combined) <= targetWords + tolerance * 2) {
      chunks[chunks.length - 2] = combined;
      chunks.pop();
    }
  }

  return chunks;

  function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }
}