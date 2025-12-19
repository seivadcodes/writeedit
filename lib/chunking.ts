// lib/chunking.ts

interface ChunkMetadata {
  id: string;
  startIndex: number;
  originalLength: number;
  overlapStart: boolean;
  overlapEnd: boolean;
  assignedModel?: string;
}

/**
 * Splits input text into optimally sized chunks based on natural breaks,
 * sentence boundaries, and token-safe limits, with configurable overlap.
 */
export function splitIntoOptimalChunks(
  text: string,
  maxTokensPerChunk: number = 1500,
  overlapWords: number = 50
): { chunks: string[]; metadata: ChunkMetadata[] } {
  const normalizedText = text.replace(/\s+/g, ' ').trim();

  const naturalBreaks = splitByNaturalBreaks(normalizedText);
  if (naturalBreaks.length < 10) {
    return splitBySentences(normalizedText, maxTokensPerChunk, overlapWords);
  }

  return processNaturalBreaks(naturalBreaks, maxTokensPerChunk, overlapWords);
}

/**
 * Reassembles edited chunks into a coherent final document,
 * intelligently stripping overlap regions to avoid duplication.
 */
export function reassembleChunks(
  originalChunks: string[],
  editedChunks: string[],
  metadata: ChunkMetadata[]
): string {
  if (editedChunks.length !== originalChunks.length) {
    console.warn('Chunk count mismatch during reassembly. Falling back to simple join.');
    return editedChunks.join('\n\n');
  }

  const reassembledParts: string[] = [];

  for (let i = 0; i < editedChunks.length; i++) {
    let chunkText = editedChunks[i];
    const meta = metadata[i];

    // Remove leading overlap (except for first chunk)
    if (i > 0 && meta.overlapStart) {
      const prevOriginal = originalChunks[i - 1];
      const overlapWordsArr = prevOriginal.split(/\s+/).slice(-50);
      const overlapText = overlapWordsArr.join(' ');

      const overlapIndex = chunkText.toLowerCase().indexOf(overlapText.toLowerCase());
      if (overlapIndex !== -1) {
        const boundaryIndex = findNaturalBoundary(chunkText, overlapIndex + overlapText.length);
        chunkText = chunkText.substring(boundaryIndex).trim();
      } else {
        const words = chunkText.split(/\s+/);
        if (words.length > 30) {
          chunkText = words.slice(30).join(' ').trim();
        }
      }
    }

    reassembledParts.push(chunkText);
  }

  return reassembledParts.join('\n\n');
}

// ─── INTERNAL HELPERS ───────────────────────────────────────────────

function splitByNaturalBreaks(text: string): { content: string; type: string; position: number }[] {
  const sections = [];
  const headingRegex = /\n#{1,3}\s+[^\n]+|\n[A-Z][A-Z\s]{5,}?\n/g;
  const headingMatches = Array.from(text.matchAll(headingRegex)).map(m => ({
    index: m.index ?? 0,
    content: m[0]
  }));

  if (headingMatches.length > 0) {
    let lastEnd = 0;
    for (const heading of headingMatches) {
      if (heading.index > lastEnd) {
        sections.push({
          content: text.substring(lastEnd, heading.index).trim(),
          type: 'content',
          position: lastEnd
        });
      }
      sections.push({
        content: heading.content.trim(),
        type: 'heading',
        position: heading.index
      });
      lastEnd = heading.index + heading.content.length;
    }
    if (lastEnd < text.length) {
      sections.push({
        content: text.substring(lastEnd).trim(),
        type: 'content',
        position: lastEnd
      });
    }
  } else {
    const paragraphRegex = /\n\s*\n/;
    const paragraphs = text.split(paragraphRegex).filter(p => p.trim().length > 0);
    let index = 0;
    for (const para of paragraphs) {
      sections.push({
        content: para.trim(),
        type: 'paragraph',
        position: index
      });
      index += para.length + 2;
    }
  }

  return sections;
}

function processNaturalBreaks(
  sections: { content: string; type: string; position: number }[],
  maxTokensPerChunk: number,
  overlapWords: number
): { chunks: string[]; metadata: ChunkMetadata[] } {
  const chunks: string[] = [];
  const metadata: ChunkMetadata[] = [];
  let currentChunk = '';
  let currentSize = 0;
  const maxWordsPerChunk = Math.floor(maxTokensPerChunk * 0.75);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sectionWords = section.content.split(/\s+/).length;

    if (sectionWords > maxWordsPerChunk) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        metadata.push(createMetadata(chunks.length - 1, chunks, currentChunk, chunks.length > 1, false));
        currentChunk = '';
        currentSize = 0;
      }

      const subsections = splitLargeSection(section.content, maxWordsPerChunk);
      for (const subsection of subsections) {
        chunks.push(subsection.trim());
        metadata.push(createMetadata(chunks.length - 1, chunks, subsection, chunks.length > 1, false));
      }
      continue;
    }

    if (currentSize + sectionWords > maxWordsPerChunk && currentChunk) {
      chunks.push(currentChunk.trim());
      metadata.push(createMetadata(chunks.length - 1, chunks, currentChunk, chunks.length > 1, false));

      if (overlapWords > 0 && chunks.length > 1) {
        const prevChunk = chunks[chunks.length - 2];
        const overlapText = prevChunk.split(/\s+/).slice(-overlapWords).join(' ');
        currentChunk = overlapText + ' ' + section.content;
        metadata[chunks.length - 1] = createMetadata(chunks.length - 1, chunks, currentChunk, true, false);
        metadata[chunks.length - 2] = {
          ...metadata[chunks.length - 2],
          overlapEnd: true
        };
      } else {
        currentChunk = section.content;
      }
      currentSize = section.content.split(/\s+/).length;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + section.content;
      currentSize += sectionWords;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
    metadata.push(createMetadata(chunks.length - 1, chunks, currentChunk, chunks.length > 1, false));
  }

  // Finalize overlapEnd
  for (let i = 0; i < metadata.length - 1; i++) {
    metadata[i] = { ...metadata[i], overlapEnd: true };
  }

  return { chunks, metadata };
}

function createMetadata(
  index: number,
  chunks: string[],
  content: string,
  overlapStart: boolean,
  overlapEnd: boolean
): ChunkMetadata {
  const startIndex = chunks.slice(0, index).join('\n\n').length;
  return {
    id: `chunk-${index + 1}`,
    startIndex,
    originalLength: content.length,
    overlapStart,
    overlapEnd
  };
}

function splitLargeSection(section: string, maxWords: number): string[] {
  const sentences = section.match(/[^.!?]+[.!?]+/g) || [section];
  const subsections: string[] = [];
  let currentSubsection = '';
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const sentenceWords = trimmed.split(/\s+/).length;
    if (currentWordCount + sentenceWords > maxWords && currentSubsection) {
      subsections.push(currentSubsection.trim());
      currentSubsection = trimmed;
      currentWordCount = sentenceWords;
    } else {
      currentSubsection += (currentSubsection ? ' ' : '') + trimmed;
      currentWordCount += sentenceWords;
    }
  }

  if (currentSubsection) {
    subsections.push(currentSubsection.trim());
  }

  return subsections;
}

function splitBySentences(
  text: string,
  maxTokensPerChunk: number,
  overlapWords: number
): { chunks: string[]; metadata: ChunkMetadata[] } {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  const metadata: ChunkMetadata[] = [];
  const maxWordsPerChunk = Math.floor(maxTokensPerChunk * 0.75);
  let currentChunk = '';
  let currentWordCount = 0;
  let startIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    const sentenceWords = sentence.split(/\s+/).length;

    if (currentWordCount + sentenceWords > maxWordsPerChunk && currentChunk) {
      chunks.push(currentChunk.trim());
      metadata.push({
        id: `chunk-${chunks.length}`,
        startIndex,
        originalLength: currentChunk.length,
        overlapStart: chunks.length > 1,
        overlapEnd: i < sentences.length - 1
      });

      startIndex += currentChunk.length + 2;
      if (overlapWords > 0 && chunks.length > 0) {
        const overlapWordsArr = currentChunk.split(/\s+/).slice(-overlapWords);
        currentChunk = overlapWordsArr.join(' ') + ' ' + sentence;
        currentWordCount = overlapWordsArr.length + sentenceWords;
      } else {
        currentChunk = sentence;
        currentWordCount = sentenceWords;
      }
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
      currentWordCount += sentenceWords;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
    metadata.push({
      id: `chunk-${chunks.length}`,
      startIndex,
      originalLength: currentChunk.length,
      overlapStart: chunks.length > 1,
      overlapEnd: false
    });
  }

  return { chunks, metadata };
}

function findNaturalBoundary(text: string, startIndex: number): number {
  const boundaryChars = ['.', '!', '?', '\n'];
  for (let i = startIndex; i < Math.min(startIndex + 100, text.length); i++) {
    if (boundaryChars.includes(text[i])) {
      return i + 1;
    }
  }
  return startIndex;
}