'use client';

import { useState, useEffect, useCallback } from 'react';
import { diffWords } from 'diff';
import { chunkText } from '@/lib/chunking';
import { useSavedDocuments, SavedDocument } from './useSavedDocuments';

export type EditLevel = 'proofread' | 'rewrite' | 'formal' | 'custom';
export type ViewMode = 'clean' | 'tracked';
export type StatusType = 'success' | 'warning' | 'error' | 'info';

const generateDiffHtml = (oldStr: string, newStr: string) => {
  const diff = diffWords(oldStr, newStr, { ignoreCase: false });
  let html = '';
  let changes = 0;

  diff.forEach(part => {
    if (part.added) {
      changes++;
      html += `<ins style="background:#e6ffe6;text-decoration:underline;">${part.value}</ins>`;
    } else if (part.removed) {
      changes++;
      html += `<del style="background:#ffe6e6;text-decoration:line-through;">${part.value}</del>`;
    } else {
      html += part.value;
    }
  });

  return { html, changes };
};

export const useAIEditor = () => {
  const {
    savedDocuments,
    currentDocumentId,
    saveDocument,
    saveProgressToCurrentDocument,
    setCurrentDocument,
    deleteDocument,
  } = useSavedDocuments();

  const [editLevel, setEditLevel] = useState<EditLevel>('proofread');
  const [customInstruction, setCustomInstruction] = useState('');
  const [inputText, setInputText] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [resultClean, setResultClean] = useState('Result will appear here');
  const [resultTracked, setResultTracked] = useState('');
  const [changesCount, setChangesCount] = useState(0);
  const [activeView, setActiveView] = useState<ViewMode>('clean');
  const [documentName, setDocumentName] = useState('');
  const [showDocuments, setShowDocuments] = useState(false);
  const [status, setStatus] = useState<{
    type: StatusType;
    message: string;
    show: boolean;
  }>({
    type: 'info',
    message: '',
    show: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Large document processing state
  const [chunks, setChunks] = useState<string[]>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(-1);
  const [chunkResults, setChunkResults] = useState<string[]>([]);
  const [chunkStartTime, setChunkStartTime] = useState<number | null>(null);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);

  useEffect(() => {
    const words = inputText.trim() ? inputText.trim().split(/\s+/).filter(Boolean).length : 0;
    setWordCount(words);
  }, [inputText]);

  const getInstruction = () => {
    const baseRules = 'Return ONLY the edited text. Do not include any explanations, introductions, summaries, labels (like "Improved Text:" or "Edited Version:"), markdown, or additional commentary. Do not wrap in quotes. Do not apologize. Just return the final edited content verbatim.';

    if (editLevel === 'proofread') {
      return `Fix ONLY spelling, grammar, punctuation, and capitalization. Do not rephrase, reword, or change style, tone, or meaning. ${baseRules}`;
    } else if (editLevel === 'rewrite') {
      return `Improve clarity, flow, and readability while preserving the original meaning and tone. Do not add new ideas or remove key points. ${baseRules}`;
    } else if (editLevel === 'formal') {
      return `Convert to formal, professional English: remove contractions, slang, casual phrasing, and emotional language. Use precise vocabulary and complete sentences. ${baseRules}`;
    } else {
      return `${customInstruction.trim() || 'Edit the text as requested.'} ${baseRules}`;
    }
  };

  const processChunk = async (chunk: string, index: number): Promise<string> => {
    try {
      const res = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: chunk,
          instruction: getInstruction(),
          model: 'x-ai/grok-4.1-fast:free',
          editLevel,
          numVariations: 1,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Chunk processing failed');
      }

      return data.editedText !== undefined && data.editedText !== null
        ? data.editedText
        : chunk;
    } catch (err: any) {
      console.error(`[AI Editor] 🔥 Chunk ${index} processing failed:`, err.message || err);
      return chunk;
    }
  };

  const processLargeDocument = async () => {
    const chunksArray = chunkText(inputText, 500, 100);
    setChunks(chunksArray);
    setChunkResults(new Array(chunksArray.length).fill(''));
    setChunkStartTime(Date.now());
    setProcessingStartTime(Date.now());
    
    let fullClean = '';
    let fullTracked = '';
    let totalChanges = 0;

    for (let i = 0; i < chunksArray.length; i++) {
      setCurrentChunkIndex(i);
      

      const editedChunk = await processChunk(chunksArray[i], i);
      
      fullClean += (fullClean ? '\n\n' : '') + editedChunk;
      setResultClean(fullClean);
      
      const diffResult = generateDiffHtml(chunksArray[i], editedChunk);
      fullTracked += (fullTracked ? '<div style="margin: 15px 0; border-top: 1px dashed #ccc;"></div>' : '') + diffResult.html;
      setResultTracked(fullTracked);
      totalChanges += diffResult.changes;
      setChangesCount(totalChanges);

      setChunkResults(prev => {
        const newResults = [...prev];
        newResults[i] = editedChunk;
        return newResults;
      });
    }

    return { fullClean, fullTracked, totalChanges };
  };

  const handleApplyEdit = async () => {
    if (!inputText.trim()) {
      showStatus('warning', 'Enter text first');
      return;
    }

    setIsLoading(true);
    

    try {
      let finalClean = '';
      let finalTracked = '';
      let finalChanges = 0;

      if (wordCount <= 1000) {
        const res = await fetch('/api/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: inputText,
            instruction: getInstruction(),
            model: 'x-ai/grok-4.1-fast:free',
            editLevel,
            numVariations: 1,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Edit request failed');
        }

        const editedText =
          data.editedText !== undefined && data.editedText !== null
            ? data.editedText
            : inputText;

        const diffResult = generateDiffHtml(inputText, editedText);

        finalClean = editedText;
        finalTracked = diffResult.html;
        finalChanges = diffResult.changes;
        setResultClean(editedText);
        setResultTracked(diffResult.html);
        setChangesCount(diffResult.changes);

        showStatus('success', 'Edit applied successfully!', 3000);
      } else {
        const { fullClean, fullTracked, totalChanges } = await processLargeDocument();
        finalClean = fullClean;
        finalTracked = fullTracked;
        finalChanges = totalChanges;
        
        setResultClean(fullClean);
        setResultTracked(fullTracked);
        setChangesCount(totalChanges);

        showStatus('success', 'Large document edited successfully!', 3000);
      }

    } catch (err: any) {
      console.error('[AI Editor] 🔥 Edit error:', err);
      showStatus('error', `Processing failed: ${err.message || 'Unknown error'}`, 5000);
    } finally {
      setIsLoading(false);
      setCurrentChunkIndex(-1);
      setChunks([]);
      setChunkStartTime(null);
      setProcessingStartTime(null);
    }
  };

  const handleCopy = async () => {
    try {
      if (activeView === 'clean') {
        await navigator.clipboard.writeText(resultClean);
        showStatus('success', 'Text copied!', 2000);
      } else if (activeView === 'tracked') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(resultTracked, 'text/html');
        let plainText = doc.body.textContent || '';
        if (!plainText.trim()) {
          plainText = resultTracked.replace(/<[^>]*>/g, '');
        }

        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
          try {
            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tracked Changes</title>
  <style>
    ins { background: #e6ffe6; text-decoration: underline; color: #006400; }
    del { background: #ffe6e6; text-decoration: line-through; color: #b22222; }
  </style>
</head>
<body>
  ${resultTracked}
</body>
</html>`;

            const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
            const textBlob = new Blob([plainText], { type: 'text/plain' });
            const clipboardItem = new ClipboardItem({
              'text/html': htmlBlob,
              'text/plain': textBlob,
            });
            await navigator.clipboard.write([clipboardItem]);
            showStatus('success', 'Tracked changes copied with formatting!', 2000);
            return;
          } catch (htmlCopyError) {
            console.warn('[AI Editor] Falling back to plain text copy:', htmlCopyError);
          }
        }

        await navigator.clipboard.writeText(plainText);
        showStatus('success', 'Text copied (plain text)!', 2000);
      }
    } catch (err: any) {
      console.error('[AI Editor] 🔥 Copy failed:', err);
      
      try {
        const textToCopy = activeView === 'clean' 
          ? resultClean 
          : new DOMParser().parseFromString(resultTracked, 'text/html').body.textContent || '';
        
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        
        showStatus('success', 'Text copied (legacy method)!', 2000);
      } catch (fallbackErr) {
        console.error('[AI Editor] 🔥 Legacy copy failed:', fallbackErr);
        showStatus('error', 'Copy failed. Please select and copy manually.', 3000);
      }
    }
  };

  const handleDownloadDocx = () => {
    showStatus('info', 'DOCX export coming soon!', 2000);
  };

  const handleSaveNew = () => {
    if (!inputText.trim() || !resultClean.trim()) {
      showStatus('warning', 'Enter and edit text first');
      return;
    }
    const name = documentName.trim() || `Document ${savedDocuments.length + 1}`;
    const id = saveDocument({
      name,
      originalText: inputText,
      editedText: resultClean,
      level: editLevel,
      model: 'x-ai/grok-4.1-fast:free',
      customInstruction: editLevel === 'custom' ? customInstruction : '',
    });
    if (id) {
      setCurrentDocument(id);
      showStatus('success', 'Document saved!', 2000);
    }
  };

  const handleSaveProgress = () => {
    if (!currentDocumentId) {
      showStatus('warning', 'No document loaded to update');
      return;
    }
    const success = saveProgressToCurrentDocument({
      originalText: inputText,
      editedText: resultClean,
    });
    if (success) {
      showStatus('success', 'Progress saved!', 2000);
    } else {
      showStatus('error', 'Failed to save progress', 2000);
    }
  };

  const toggleDocuments = () => {
    setShowDocuments(prev => !prev);
  };

  const loadDocument = (doc: SavedDocument) => {
    setInputText(doc.originalText);
    setResultClean(doc.editedText || doc.originalText);
    setDocumentName(doc.name);
    setCurrentDocument(doc.id);
    const diffResult = generateDiffHtml(doc.originalText, doc.editedText || doc.originalText);
    setResultTracked(diffResult.html);
    setChangesCount(diffResult.changes);
    setShowDocuments(false);
    showStatus('info', `Loaded: ${doc.name}`, 2000);
  };

  const showStatus = (type: StatusType, message: string, durationMs: number = 0) => {
    setStatus({ type, message, show: true });
    if (durationMs > 0) {
      setTimeout(() => setStatus(prev => ({ ...prev, show: false })), durationMs);
    }
  };

  const getProgressMetrics = () => {
    if (currentChunkIndex < 0 || !chunkStartTime || !processingStartTime || chunks.length === 0) {
      return null;
    }

    const elapsedMs = Date.now() - chunkStartTime;
    const chunksProcessed = currentChunkIndex + 1;
    const avgMsPerChunk = elapsedMs / chunksProcessed;
    const estimatedTotalMs = avgMsPerChunk * chunks.length;
    const remainingMs = estimatedTotalMs - elapsedMs;
    
    return {
      progress: Math.round((chunksProcessed / chunks.length) * 100),
      chunksProcessed,
      totalChunks: chunks.length,
      timeElapsed: Math.round((Date.now() - processingStartTime) / 1000),
      estimatedRemaining: Math.max(0, Math.round(remainingMs / 1000)),
    };
  };

  return {
    editLevel,
    customInstruction,
    inputText,
    wordCount,
    resultClean,
    resultTracked,
    changesCount,
    activeView,
    documentName,
    showDocuments,
    savedDocuments,
    status,
    isLoading,
    currentChunkIndex,
    chunks,
    chunkResults,
    progressMetrics: getProgressMetrics(),
    currentDocumentId,
    setEditLevel,
    setCustomInstruction,
    setInputText,
    setActiveView,
    setDocumentName,
    handleApplyEdit,
    handleCopy,
    handleDownloadDocx,
    handleSaveNew,
    handleSaveProgress,
    toggleDocuments,
    loadDocument,
    deleteDocument,
    setCurrentDocument,
  };
};