// app/utils/chunking.ts
export interface Chunk {
  id: string;
  text: string;
  wordCount: number;
  startIndex: number;
  endIndex: number;
}

const MIN_CHUNK_WORDS = 400;
const MAX_CHUNK_WORDS = 600;
const IDEAL_CHUNK_WORDS = 500;
const SPEECH_MARKER_REGEX = /(^|\s)(["'“])([^"”']+?)(["'”])(?=\s|$)/g;

/**
 * Smartly chunks text while respecting semantic boundaries:
 * 1. Never splits within quoted speeches
 * 2. Prefers paragraph boundaries
 * 3. Balances chunk sizes to avoid tiny final chunks
 * 4. Handles edge cases like very long paragraphs
 */
export const smartChunkText = (text: string): Chunk[] => {
  if (!text.trim()) return [];
  
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const chunks: Chunk[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;
  let globalIndex = 0;

  // Helper to create a chunk from accumulated paragraphs
  const createChunk = () => {
    if (currentChunk.length === 0) return;
    
    const chunkText = currentChunk.join('\n\n');
    const chunkId = `chunk-${chunks.length + 1}`;
    const startIndex = globalIndex;
    const endIndex = startIndex + chunkText.length;
    
    chunks.push({
      id: chunkId,
      text: chunkText,
      wordCount: currentWordCount,
      startIndex,
      endIndex
    });
    
    globalIndex = endIndex + 2; // Account for paragraph separators
    currentChunk = [];
    currentWordCount = 0;
  };

  // Helper to count words in a string
  const countWords = (str: string) => str.trim().split(/\s+/).filter(Boolean).length;

  // Helper to check if text contains incomplete speech
  const hasUnbalancedSpeech = (text: string) => {
    const quotes = text.match(/["'“”]/g) || [];
    return quotes.length % 2 !== 0;
  };

  // Process paragraphs
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    const paraWordCount = countWords(para);
    
    // Case 1: Paragraph is too large for a single chunk
    if (paraWordCount > MAX_CHUNK_WORDS) {
      // Handle as special case - split by sentences while preserving speeches
      const subChunks = splitLargeParagraph(para, globalIndex);
      chunks.push(...subChunks);
      globalIndex += para.length + 2;
      continue;
    }

    // Case 2: Adding this paragraph would exceed max size
    if (currentWordCount + paraWordCount > MAX_CHUNK_WORDS) {
      // Check if we have enough content to form a valid chunk
      if (currentWordCount >= MIN_CHUNK_WORDS) {
        createChunk();
      }
      // If current chunk is too small, carry over to next chunk
      else if (chunks.length > 0) {
        // Rebalance with previous chunk if possible
        rebalanceChunks(chunks, currentChunk, currentWordCount, para, paraWordCount);
        createChunk();
      }
    }

    // Case 3: Check for speech boundaries
    currentChunk.push(para);
    currentWordCount += paraWordCount;
    
    if (hasUnbalancedSpeech(currentChunk.join(' '))) {
      // Keep accumulating until speech closes or we hit max size
      continue;
    }

    // Case 4: Perfect chunk size reached
    if (currentWordCount >= IDEAL_CHUNK_WORDS) {
      createChunk();
    }
  }

  // Handle remaining content
  if (currentChunk.length > 0) {
    // Rebalance last chunk if too small
    if (currentWordCount < MIN_CHUNK_WORDS && chunks.length > 0) {
      rebalanceFinalChunk(chunks, currentChunk.join('\n\n'), currentWordCount);
    } else {
      createChunk();
    }
  }

  // Edge case: no chunks created (single tiny paragraph)
  if (chunks.length === 0 && currentChunk.length > 0) {
    createChunk();
  }

  return chunks;
};

// Helper to split very large paragraphs
const splitLargeParagraph = (text: string, startIndex: number): Chunk[] => {
  // Split by sentences but preserve quoted speeches
  const sentences = text.match(/(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|\!)\s+(?=[A-Z])/g) || [text];
  const chunks: Chunk[] = [];
  let currentChunk = '';
  let currentWordCount = 0;
  let position = startIndex;

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);
    
    // Ensure we don't break speeches
    if (hasUnbalancedSpeech(currentChunk + ' ' + sentence)) {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
      currentWordCount += sentenceWords;
      continue;
    }

    // Create new chunk when approaching limits
    if (currentWordCount + sentenceWords > MAX_CHUNK_WORDS && currentWordCount >= MIN_CHUNK_WORDS) {
      chunks.push({
        id: `chunk-${chunks.length + 1}`,
        text: currentChunk.trim(),
        wordCount: currentWordCount,
        startIndex: position,
        endIndex: position + currentChunk.length
      });
      
      position += currentChunk.length + 1;
      currentChunk = sentence;
      currentWordCount = sentenceWords;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
      currentWordCount += sentenceWords;
    }
  }

  // Add final fragment
  if (currentChunk.trim()) {
    chunks.push({
      id: `chunk-${chunks.length + 1}`,
      text: currentChunk.trim(),
      wordCount: currentWordCount,
      startIndex: position,
      endIndex: position + currentChunk.length
    });
  }

  return chunks;
};

// Helper to count words
const countWords = (str: string) => str.trim().split(/\s+/).filter(Boolean).length;

// Check for unbalanced quotes
const hasUnbalancedSpeech = (text: string) => {
  const openingQuotes = (text.match(/["'“]/g) || []).length;
  const closingQuotes = (text.match(/["'”]/g) || []).length;
  return openingQuotes !== closingQuotes;
};

// Rebalance chunks when current chunk is too small
const rebalanceChunks = (
  chunks: Chunk[],
  currentChunk: string[],
  currentWordCount: number,
  nextParagraph: string,
  nextWordCount: number
) => {
  const lastChunk = chunks[chunks.length - 1];
  if (!lastChunk) return;

  // Calculate potential rebalance
  const potentialSize = lastChunk.wordCount + currentWordCount;
  
  // Only rebalance if it creates more balanced chunks
  if (potentialSize <= MAX_CHUNK_WORDS && lastChunk.wordCount > IDEAL_CHUNK_WORDS) {
    // Move content from last chunk to current
    const lastParagraphs = lastChunk.text.split('\n\n');
    if (lastParagraphs.length > 1) {
      const movableParagraph = lastParagraphs.pop()!;
      const movableWordCount = countWords(movableParagraph);
      
      // Create new last chunk
      chunks[chunks.length - 1] = {
        ...lastChunk,
        text: lastParagraphs.join('\n\n'),
        wordCount: lastChunk.wordCount - movableWordCount,
        endIndex: lastChunk.startIndex + lastParagraphs.join('\n\n').length
      };
      
      // Add to current chunk
      currentChunk.unshift(movableParagraph);
      currentWordCount += movableWordCount;
    }
  }
};

// Rebalance final chunk with previous chunk
const rebalanceFinalChunk = (
  chunks: Chunk[],
  remainingText: string,
  remainingWords: number
) => {
  const lastChunk = chunks[chunks.length - 1];
  if (!lastChunk || remainingWords > MIN_CHUNK_WORDS) return;

  const combinedWords = lastChunk.wordCount + remainingWords;
  
  // Only rebalance if combined size is acceptable
  if (combinedWords <= MAX_CHUNK_WORDS) {
    chunks[chunks.length - 1] = {
      ...lastChunk,
      text: `${lastChunk.text}\n\n${remainingText}`,
      wordCount: combinedWords,
      endIndex: lastChunk.endIndex + remainingText.length + 2
    };
  }
  // Otherwise create a new small chunk
  else {
    const startIndex = lastChunk.endIndex + 2;
    chunks.push({
      id: `chunk-${chunks.length + 1}`,
      text: remainingText,
      wordCount: remainingWords,
      startIndex,
      endIndex: startIndex + remainingText.length
    });
  }
};