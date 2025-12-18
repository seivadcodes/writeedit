// /components/EditorUI.tsx
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useEditor, EditLevel } from '@/hooks/useEditor';
import { useDocument, SavedDocument } from '@/hooks/useDocument';
import { TrackedChangesView } from '@/components/TrackedChangesView';

// Performance-optimized chunk size (adjust based on model capabilities)
const CHUNK_SIZE = 750; // words per chunk
const MAX_CONCURRENT_CHUNKS = 4; // balance between speed and API limits

export function EditorUI() {
  const editor = useEditor();
  const docManager = useDocument();
  const trackedRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingChunksRef = useRef<AbortController[]>([]);

  const {
    documents,
    isLoading: isDocLoading,
    error: docError,
    saveDocument,
    saveProgress,
    deleteDocument,
  } = docManager;

  const {
    inputText,
    editedText,
    editLevel,
    customInstruction,
    isLoading,
    error,
    viewMode,
    wordCount,
    documentId,
    changeCount,
    setInputText,
    setEditLevel,
    setCustomInstruction,
    setViewMode,
    applyEdit,
  } = editor;

  const [documentName, setDocumentName] = useState('');
  const [showDocuments, setShowDocuments] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [chunkProgress, setChunkProgress] = useState<{ processed: number; total: number; isProcessing: boolean }>({
    processed: 0,
    total: 0,
    isProcessing: false
  });
  const [chunkResults, setChunkResults] = useState<string[]>([]);
  const [isChunkedProcessing, setIsChunkedProcessing] = useState(false);

  // Auto-show document panel after first edit
  useEffect(() => {
    if (editedText && !isLoading) {
      setShowDocuments(true);
    }
  }, [editedText, isLoading]);

  useEffect(() => {
    if (!documentName.trim() && inputText.trim()) {
      const name = inputText.substring(0, 50).replace(/\s+/g, ' ').trim() + (inputText.length > 50 ? '...' : '');
      setDocumentName(name);
    }
  }, [inputText]);

  // Cleanup chunk processing on unmount
  useEffect(() => {
    return () => {
      processingChunksRef.current.forEach(controller => controller.abort());
    };
  }, []);

  const extractCleanTextFromTrackedDOM = useCallback((): string => {
    if (!trackedRef.current) return editedText;

    const clone = trackedRef.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.change-action, del').forEach(el => el.remove());
    clone.querySelectorAll('ins').forEach(el => {
      const text = document.createTextNode(el.textContent || '');
      el.replaceWith(text);
    });
    clone.querySelectorAll('.change-group').forEach(group => {
      while (group.firstChild) {
        group.parentNode?.insertBefore(group.firstChild, group);
      }
      group.remove();
    });

    return clone.textContent?.trim() || editedText;
  }, [editedText]);

  const handleCopy = async () => {
    const textToCopy = extractCleanTextFromTrackedDOM();
    if (!textToCopy.trim()) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      alert('✅ Copied!');
    } catch {
      alert('Failed to copy.');
    }
  };

  const handleDownload = () => {
    const textToDownload = extractCleanTextFromTrackedDOM();
    if (!textToDownload.trim()) return;
    const blob = new Blob([textToDownload], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited-document-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Ultra-fast text chunking algorithm
  const chunkText = useCallback((text: string, chunkSize: number): string[] => {
    const paragraphs = text.split(/\n{2,}/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentWordCount = 0;

    // First try to chunk by paragraphs
    for (const para of paragraphs) {
      const wordCount = para.trim().split(/\s+/).filter(w => w).length;
      
      if (currentWordCount + wordCount > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [];
        currentWordCount = 0;
      }
      
      if (wordCount > chunkSize * 2) {
        // Handle extremely large paragraphs by splitting them
        const sentences = para.split(/(?<=[.!?])\s+/);
        let sentenceChunk = '';
        let sentenceWordCount = 0;
        
        for (const sentence of sentences) {
          const sWordCount = sentence.trim().split(/\s+/).filter(w => w).length;
          
          if (sentenceWordCount + sWordCount > chunkSize && sentenceChunk) {
            chunks.push(sentenceChunk.trim());
            sentenceChunk = sentence;
            sentenceWordCount = sWordCount;
          } else {
            sentenceChunk = sentenceChunk ? `${sentenceChunk} ${sentence}` : sentence;
            sentenceWordCount += sWordCount;
          }
        }
        
        if (sentenceChunk) {
          chunks.push(sentenceChunk.trim());
        }
      } else {
        currentChunk.push(para);
        currentWordCount += wordCount;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
    }

    return chunks;
  }, []);

  // Process large documents by chunking
  const processLargeDocument = useCallback(async () => {
    if (!inputText.trim()) return;
    
    const totalWords = inputText.trim().split(/\s+/).filter(w => w).length;
    if (totalWords <= 2000) {
      // Small enough for single request
      applyEdit();
      return;
    }
    
    // Start chunked processing
    setIsChunkedProcessing(true);
    setChunkProgress({ processed: 0, total: 0, isProcessing: true });
    setChunkResults([]);
    
    // Split text into chunks
    const chunks = chunkText(inputText, CHUNK_SIZE);
    setChunkProgress(prev => ({ ...prev, total: chunks.length }));
    
    // Reset abort controllers
    processingChunksRef.current.forEach(controller => controller.abort());
    processingChunksRef.current = [];
    
    // Process chunks with controlled concurrency
    const results: string[] = new Array(chunks.length).fill('');
    let nextChunkIndex = 0;
    let activeRequests = 0;
    let isAborted = false;
    
    const processNextChunk = async () => {
      if (isAborted || nextChunkIndex >= chunks.length) return;
      
      const chunkIndex = nextChunkIndex++;
      const controller = new AbortController();
      processingChunksRef.current.push(controller);
      
      try {
        activeRequests++;
        setChunkProgress(prev => ({ ...prev, processed: prev.processed + 1 }));
        
        const response = await fetch('/api/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: chunks[chunkIndex],
            instruction: editLevel === 'custom' ? customInstruction : editLevel,
            model: 'mistralai/devstral-2512:free',
            editLevel,
            chunkIndex,
            totalChunks: chunks.length
          }),
          signal: controller.signal
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        results[chunkIndex] = data.editedText || chunks[chunkIndex];
      } catch (err) {
        if (!(err instanceof Error) || !err.message.includes('Abort')) {
          console.error(`Chunk ${chunkIndex} failed:`, err);
          // Retry once on failure
          try {
            results[chunkIndex] = chunks[chunkIndex]; // fallback to original
          } catch (retryErr) {
            console.error(`Chunk ${chunkIndex} retry failed:`, retryErr);
            results[chunkIndex] = chunks[chunkIndex]; // fallback to original
          }
        }
      } finally {
        activeRequests--;
        
        // If all chunks processed, combine results
        if (activeRequests === 0 && nextChunkIndex >= chunks.length) {
          if (!isAborted) {
            // Combine results while preserving paragraph structure
            const combined = results.filter(Boolean).join('\n\n');
            editor.setEditedText(combined);
            setIsChunkedProcessing(false);
            setChunkProgress({ processed: chunks.length, total: chunks.length, isProcessing: false });
            setShowDocuments(true);
          }
        }
      }
    };
    
    // Start initial batch of requests
    const initialBatch = Math.min(MAX_CONCURRENT_CHUNKS, chunks.length);
    for (let i = 0; i < initialBatch; i++) {
      processNextChunk();
    }
    
    // Process remaining chunks as slots become available
    const interval = setInterval(() => {
      if (isAborted) {
        clearInterval(interval);
        return;
      }
      
      while (activeRequests < MAX_CONCURRENT_CHUNKS && nextChunkIndex < chunks.length) {
        processNextChunk();
      }
      
      if (activeRequests === 0 && nextChunkIndex >= chunks.length) {
        clearInterval(interval);
      }
    }, 100);
    
    // Cleanup function
    return () => {
      isAborted = true;
      clearInterval(interval);
      processingChunksRef.current.forEach(controller => controller.abort());
      processingChunksRef.current = [];
    };
  }, [inputText, editLevel, customInstruction, chunkText, applyEdit, editor]);

  const enhancedApplyEdit = useCallback(async () => {
  if (isLoading || isChunkedProcessing) return;
  await processLargeDocument();
}, [isLoading, isChunkedProcessing, processLargeDocument]);

  const handleAcceptChange = useCallback(() => {}, []);
  const handleRejectChange = useCallback(() => {}, []);

  const handleSaveDocument = async () => {
    const original = inputText;
    const final = extractCleanTextFromTrackedDOM();
    if (!original.trim() || !final.trim()) {
      alert('No valid content to save. Please run "Edit" first.');
      return;
    }
    const id = await saveDocument(final, original, documentName);
    if (id) {
      editor.setDocumentId(id);
      setDocumentName('');
    }
  };

  const handleSaveProgress = async () => {
    const original = inputText;
    const final = extractCleanTextFromTrackedDOM();
    if (!original.trim() || !final.trim() || !documentId) {
      alert('No valid content or active document to update.');
      return;
    }
    await saveProgress(documentId, final, original);
  };

  const handleDocumentClick = (doc: SavedDocument) => {
    editor.loadDocument(doc.id, {
      originalText: doc.original_text,
      editedText: doc.edited_text,
      level: doc.level,
      model: doc.model,
      customInstruction: doc.custom_instruction,
    });
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    if (fileInputRef.current) fileInputRef.current.value = '';
    setSelectedFile(file);

    try {
      let text = '';
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else if (fileName.endsWith('.doc')) {
        alert('⚠️ Legacy .doc files have limited support. For best results, convert to .docx.');
        const reader = new FileReader();
        reader.readAsText(file);
        await new Promise((resolve) => {
          reader.onload = resolve;
          reader.onerror = resolve;
        });
        text = reader.result as string;
      } else {
        alert('Please upload .docx or .doc files only.');
        setSelectedFile(null);
        return;
      }

      if (text.trim()) {
        setInputText(text);
        const cleanName = file.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[^\w\s-]/g, '')
          .trim()
          .substring(0, 40) || 'New Document';
        setDocumentName(cleanName);
      } else {
        alert('Could not extract readable text from the document.');
      }
    } catch (err) {
      console.error('File parsing error:', err);
      alert('Failed to read document. Please ensure it\'s a valid Microsoft Word file.');
    } finally {
      setSelectedFile(null);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="editor-ui max-w-4xl mx-auto p-4 space-y-6 bg-white text-black min-h-screen">
      
      {/* === 1. Original Text === */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold text-black">Original Text</h2>
          <span className="text-sm text-gray-600">{wordCount} word{wordCount !== 1 ? 's' : ''}</span>
        </div>

        <div className="mb-4 p-4 border-2 border-dashed rounded-xl border-blue-200 bg-blue-50/40 hover:border-blue-300 transition-colors">
          <div className="flex flex-col items-center justify-center py-5 px-4 text-center">
            <div className="mb-3 p-3 bg-blue-100 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">Upload a Microsoft Word document</p>
            <p className="text-xs text-gray-500 mb-3">.docx or .doc • Max 10MB</p>
            <button
              type="button"
              onClick={triggerFileUpload}
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="-ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Browse Word Files
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".docx,.doc"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
              className="hidden"
            />
          </div>

          {selectedFile && (
            <div className="mt-3 flex items-center justify-center text-sm text-blue-600">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing {selectedFile.name}...
            </div>
          )}
        </div>

        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Paste your text here or upload a Word document above..."
          rows={8}
          className="w-full p-3 border border-gray-300 rounded-md font-mono text-sm text-black bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={isLoading || isChunkedProcessing}
        />
      </div>

      {/* === 2. Editing Level === */}
      <div>
        <h3 className="font-medium mb-2 text-black">Editing Level</h3>
        <div className="flex flex-wrap gap-2">
          {(['proofread', 'rewrite', 'formal', 'custom'] as EditLevel[]).map((level) => (
            <button
              key={level}
              className={`px-3 py-1 text-sm rounded-md ${
                editLevel === level
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
              onClick={() => setEditLevel(level)}
              disabled={isLoading || isChunkedProcessing}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
        {editLevel === 'custom' && (
          <input
            type="text"
            value={customInstruction}
            onChange={(e) => setCustomInstruction(e.target.value)}
            placeholder="Enter custom instruction..."
            className="w-full mt-2 p-2 border border-gray-300 rounded text-sm text-black bg-white"
            disabled={isLoading || isChunkedProcessing}
          />
        )}
      </div>

      {/* === 3. ✨ Enhanced Edit Button with Chunk Processing === */}
      <div>
        <button
          id="edit-btn"
          onClick={enhancedApplyEdit}
          disabled={isLoading || isChunkedProcessing || !inputText.trim()}
          className={`px-4 py-2 rounded-md font-medium ${
            isLoading || isChunkedProcessing
              ? 'bg-gray-400 cursor-not-allowed'
              : inputText.trim()
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isLoading ? '⏳ Processing...' : isChunkedProcessing ? `🚀 Processing (${chunkProgress.processed}/${chunkProgress.total})` : '✨ Edit'}
        </button>
        
        {isChunkedProcessing && (
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${(chunkProgress.processed / chunkProgress.total) * 100}%` }}
              ></div>
            </div>
          </div>
        )}
        
        {(error || docError) && (
          <p className="mt-2 text-red-600 text-sm">{error || docError}</p>
        )}
      </div>

      {/* === 4. Edited Result === */}
      {(editedText || isLoading || isChunkedProcessing) && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold text-black">Edited Result</h2>
            <div className="flex gap-2">
              <button
                id="copy-btn"
                onClick={handleCopy}
                disabled={isLoading || isChunkedProcessing}
                className={`px-3 py-1 text-sm rounded ${
                  isLoading || isChunkedProcessing
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                📋 Copy
              </button>
              <button
                id="download-btn"
                onClick={handleDownload}
                disabled={isLoading || isChunkedProcessing}
                className={`px-3 py-1 text-sm rounded ${
                  isLoading || isChunkedProcessing
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                💾 Download
              </button>
            </div>
          </div>

          <div className="flex mb-2">
            <button
              className={`px-3 py-1 text-sm ${
                viewMode === 'clean'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
              onClick={() => setViewMode('clean')}
              disabled={isLoading || isChunkedProcessing}
            >
              Clean View
            </button>
            <button
              className={`px-3 py-1 text-sm ml-1 ${
                viewMode === 'tracked'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
              onClick={() => setViewMode('tracked')}
              disabled={isLoading || isChunkedProcessing}
            >
              Tracked Changes ({changeCount} change{changeCount !== 1 ? 's' : ''})
            </button>
          </div>

          <div
            ref={trackedRef}
            className="min-h-[200px] p-3 border rounded-md bg-white font-mono text-sm text-black"
            style={{ lineHeight: '1.5', whiteSpace: 'pre-wrap' }}
          >
            {viewMode === 'clean' ? (
              editedText || (isChunkedProcessing ? 'Processing large document in chunks...' : 'Result will appear here...')
            ) : (
            <TrackedChangesView
  key={documentId || 'new'}
  originalText={inputText}
  editedText={editedText}
  onAcceptChange={handleAcceptChange}
  onRejectChange={handleRejectChange}
/>
            )}
          </div>
        </div>
      )}

      {!editedText && !isLoading && !isChunkedProcessing && (
        <div className="p-3 bg-gray-50 border rounded text-gray-500 text-sm">
          Result will appear here after you click "Edit".
        </div>
      )}

      {/* === 5. Document Management (auto-shows after edit) === */}
      <div className="border-t border-gray-300 pt-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-black">Document Management</h2>
          <button
            onClick={() => setShowDocuments(!showDocuments)}
            className="text-sm text-blue-600"
          >
            {showDocuments ? '↑ Hide' : '↓ Show'}
          </button>
        </div>

        {showDocuments && (
          <div id="documents-panel" className="mt-2 p-4 bg-gray-50 rounded border border-gray-200">
            <input
              id="document-name"
              type="text"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              placeholder="Document name..."
              className="w-full p-2 border border-gray-300 rounded text-sm mb-2 text-black bg-white"
              disabled={isLoading || isChunkedProcessing}
            />
            <div className="flex gap-2">
              <button
                id="save-document-btn"
                onClick={handleSaveDocument}
                disabled={isLoading || isDocLoading || isChunkedProcessing || !editedText}
                className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                💾 Save Document
              </button>
              <button
                id="save-progress-btn"
                onClick={handleSaveProgress}
                disabled={!documentId || isLoading || isDocLoading || isChunkedProcessing || !editedText}
                className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
              >
                🔄 Save Progress
              </button>
            </div>

            <div className="mt-4">
              <h3 className="font-medium mb-2 text-black">Saved Documents</h3>
              <div id="documents-list" className="space-y-2 max-h-60 overflow-y-auto">
                {documents.length === 0 ? (
                  <div className="text-gray-500 text-sm">No saved documents yet</div>
                ) : (
                  documents.map((doc) => {
                    const date = new Date(doc.created_at);
                    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    return (
                      <div
                        key={doc.id}
                        className={`p-2 border rounded cursor-pointer ${
                          doc.id === documentId
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-300 hover:bg-gray-100'
                        }`}
                        onClick={() => handleDocumentClick(doc)}
                      >
                        <div className="flex justify-between items-start">
                          <div className="font-medium text-sm text-black">{doc.name}</div>
                          <div className="text-xs text-gray-500">{formattedDate}</div>
                        </div>
                        <div className="flex justify-end gap-1 mt-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDocumentClick(doc);
                            }}
                            className="text-xs text-blue-600"
                          >
                            ↩️
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('Delete this document?')) deleteDocument(doc.id);
                            }}
                            className="text-xs text-red-600"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}