'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAIEditor } from '@/hooks/useAIEditor';
import type { SavedDocument } from '@/hooks/useSavedDocuments';

// Define theme constants
const theme = {
  primary: '#4CAF50',
  secondary: '#2196F3',
  danger: '#f44336',
  bg: '#f9f9f9',
  card: '#fff',
  border: '#ddd',
  text: '#333',
  textLight: '#666',
  success: '#4CAF50',
  warning: '#ff9800',
  error: '#f44336',
  info: '#2196F3',
};

// Reusable style blocks
const sectionBase = {
  backgroundColor: theme.card,
  border: `1px solid ${theme.border}`,
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '20px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
};

const buttonBase = {
  backgroundColor: theme.primary,
  color: 'white',
  border: 'none',
  padding: '8px 12px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold' as const,
  minWidth: 'max-content',
  transition: 'background 0.2s',
};

const toggleView = (isActive: boolean) => ({
  padding: '6px 12px',
  backgroundColor: isActive ? theme.primary : '#e0e0e0',
  border: `1px solid ${theme.border}`,
  borderRadius: '4px',
  cursor: 'pointer',
  color: isActive ? 'white' : 'inherit',
  transition: 'all 0.2s',
  fontSize: '14px',
});

const levelOption = (isActive: boolean) => ({
  display: 'inline-block',
  padding: '6px 12px',
  margin: '4px',
  backgroundColor: isActive ? theme.primary : '#e0e0e0',
  borderRadius: '4px',
  cursor: 'pointer',
  color: isActive ? 'white' : 'inherit',
  transition: 'all 0.2s',
});

const inputStyle = {
  width: '100%',
  padding: '8px',
  margin: '4px 0',
  border: `1px solid ${theme.border}`,
  borderRadius: '4px',
  fontFamily: 'inherit',
  fontSize: '14px',
};

const textareaStyle = {
  width: '100%',
  minHeight: '120px',
  padding: '10px',
  border: `1px solid ${theme.border}`,
  borderRadius: '4px',
  resize: 'vertical' as const,
  fontFamily: 'inherit',
  fontSize: '14px',
  lineHeight: 1.5,
};

const resultBox = {
  whiteSpace: 'pre-wrap' as const,
  padding: '12px',
  backgroundColor: '#fafafa',
  border: `1px solid ${theme.border}`,
  borderRadius: '4px',
  minHeight: '100px',
  marginTop: '10px',
  maxHeight: '60vh',
  overflow: 'auto',
  lineHeight: 1.6,
};

const statusStyle = (type: 'success' | 'warning' | 'error' | 'info') => ({
  padding: '8px',
  marginTop: '10px',
  marginBottom: '10px',
  borderRadius: '4px',
  backgroundColor:
    type === 'success'
      ? '#e6ffe6'
      : type === 'warning'
      ? '#fff3cd'
      : type === 'error'
      ? '#ffe6e6'
      : '#e7f3ff',
  color:
    type === 'success'
      ? 'green'
      : type === 'warning'
      ? '#856404'
      : type === 'error'
      ? 'red'
      : '#004085',
  border: `1px solid ${
    type === 'success'
      ? '#c3e6cb'
      : type === 'warning'
      ? '#ffe0b2'
      : type === 'error'
      ? '#f5c6cb'
      : '#bee5eb'
  }`,
});

const documentItemStyle = {
  padding: '10px',
  marginBottom: '8px',
  backgroundColor: 'white',
  borderRadius: '5px',
  border: '1px solid #eee',
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const containerStyle = {
  maxWidth: '1200px',
  margin: '0 auto',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  backgroundColor: theme.bg,
  color: theme.text,
  padding: '12px',
  lineHeight: 1.6,
};

const headingStyle = {
  marginBottom: '12px',
  fontSize: '24px',
  textAlign: 'center' as const,
  color: theme.text,
};

const progressBarContainer = {
  marginTop: '15px',
  backgroundColor: '#e0e0e0',
  borderRadius: '10px',
  height: '20px',
  overflow: 'hidden',
};

const progressBarFill = (progress: number, success: boolean) => ({
  height: '100%',
  backgroundColor: success ? theme.success : theme.primary,
  width: `${progress}%`,
  transition: 'width 0.3s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
  fontSize: '12px',
  fontWeight: 'bold' as const,
});

const chunkStatusStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  marginTop: '8px',
  fontSize: '13px',
  color: theme.textLight,
};

const chunkItemStyle = (isActive: boolean) => ({
  padding: '6px 10px',
  margin: '2px',
  borderRadius: '4px',
  backgroundColor: isActive ? theme.primary : '#f0f0f0',
  color: isActive ? 'white' : theme.text,
  fontSize: '12px',
  cursor: 'pointer',
  transition: 'all 0.2s',
});

const fileUploadButtonStyle = {
  ...buttonBase,
  backgroundColor: theme.secondary,
  display: 'inline-block',
  marginBottom: '15px',
  cursor: 'pointer',
  padding: '8px 12px',
  fontSize: '14px',
};

const EditorUI = () => {
  const {
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
    progressMetrics,
    currentDocumentId,

    setEditLevel,
    setCustomInstruction,
    setInputText,
    setActiveView,
    setDocumentName,

    handleApplyEdit,
    handleCopy,
    handleSaveNew,
    handleSaveProgress,
    toggleDocuments,
    loadDocument,
    deleteDocument,
  } = useAIEditor();

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [clipboardSupported, setClipboardSupported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check clipboard API support on mount
  useEffect(() => {
    const checkClipboardSupport = async () => {
      try {
        const basicSupport = typeof navigator.clipboard !== 'undefined';
        const execCommandSupport = document.queryCommandSupported?.('copy');
        setClipboardSupported(basicSupport || !!execCommandSupport);
      } catch (e) {
        console.warn('Clipboard support check failed:', e);
        setClipboardSupported(false);
      }
    };

    checkClipboardSupport();
  }, []);

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    setUploadError(null);
    
    if (
      file.type !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
      file.type !== 'application/msword'
    ) {
      setUploadError('Please upload a Word document (.doc or .docx)');
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const { default: mammoth } = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;
      
      setDocumentName(file.name.replace(/\.[^/.]+$/, ''));
      setInputText(text);
    } catch (error) {
      console.error('Error processing Word document:', error);
      setUploadError('Failed to process the document. Please try again.');
    }
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      handleFileUpload(file);
      // Reset input value to allow re-uploading same file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Check if results are available
  const hasResults = !isLoading && (resultClean || resultTracked);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={containerStyle}>
        <h1 style={headingStyle}>AI Editorial Board — Document Editor</h1>

        {/* Input */}
        <div style={sectionBase}>
          <h3 style={{ marginTop: 0 }}>Input Text</h3>
          
          {/* File Upload Button */}
          <div>
            <input
              type="file"
              id="file-upload"
              accept=".doc, .docx"
              onChange={handleFileInputChange}
              ref={fileInputRef}
              style={{ display: 'none' }}
            />
            <label 
              htmlFor="file-upload" 
              style={fileUploadButtonStyle}
            >
              📂 Upload Word Document
            </label>
          </div>
          
          {uploadError && (
            <div style={statusStyle('error')}>
              {uploadError}
            </div>
          )}

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste your document here or upload a Word file..."
            style={textareaStyle}
            disabled={isLoading}
          />
          <div style={{ fontSize: '12px', color: theme.textLight, marginTop: '4px' }}>
            Word count: <span>{wordCount.toLocaleString()} word{wordCount !== 1 ? 's' : ''}</span>
            {wordCount > 1000 && (
              <span style={{ color: theme.warning, marginLeft: '8px' }}>
                Large document processing may take longer
              </span>
            )}
          </div>
        </div>

        {/* Edit Level */}
        <div style={sectionBase}>
          <h3 style={{ marginTop: 0 }}>Edit Level</h3>
          <div style={{ marginBottom: '10px' }}>
            {(['proofread', 'rewrite', 'formal', 'custom'] as const).map((level) => (
              <span
                key={level}
                style={levelOption(editLevel === level)}
                onClick={() => setEditLevel(level)}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </span>
            ))}
          </div>
          {editLevel === 'custom' && (
            <textarea
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder="Enter your custom instruction..."
              style={{ ...textareaStyle, marginTop: '8px' }}
            />
          )}
        </div>

        {/* Actions */}
        <div style={sectionBase}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button 
              onClick={handleApplyEdit} 
              style={{ 
                ...buttonBase, 
                opacity: isLoading ? 0.7 : 1,
                cursor: isLoading ? 'not-allowed' : 'pointer'
              }}
              disabled={isLoading}
            >
              {isLoading ? '⏳ Processing...' : '✨ Apply Edit'}
            </button>
          </div>
          
          {status.show && <div style={statusStyle(status.type)}>{status.message}</div>}
          
          {/* Large Document Progress */}
          {isLoading && wordCount > 1000 && progressMetrics && (
            <div style={{ marginTop: '15px' }}>
              <div style={progressBarContainer}>
                <div style={progressBarFill(progressMetrics.progress, progressMetrics.chunksProcessed === progressMetrics.totalChunks)}>
                  {progressMetrics.progress}%
                </div>
              </div>
              
              <div style={chunkStatusStyle}>
                <span>Elapsed: {progressMetrics.timeElapsed}s</span>
                <span>Est. remaining: {progressMetrics.estimatedRemaining}s</span>
              </div>
              
              <div style={{ marginTop: '10px', maxHeight: '100px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {chunks.map((chunk, index) => {
                    const isCurrent = index === currentChunkIndex;
                    const isProcessed = index < currentChunkIndex;
                    const chunkWords = chunk.trim().split(/\s+/).filter(Boolean).length;
                    
                    return (
                      <div 
                        key={index} 
                        title={`Chunk ${index + 1}: ${chunkWords} words`}
                        style={chunkItemStyle(isCurrent)}
                      >
                        {isProcessed ? '✓' : isCurrent ? '🕗' : index + 1}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        <div style={sectionBase}>
          <h3 style={{ marginTop: 0 }}>Edited Output</h3>
          
          {hasResults && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* View toggles + Copy button inline */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <button
                  style={toggleView(activeView === 'clean')}
                  onClick={() => setActiveView('clean')}
                  disabled={isLoading}
                >
                  Clean View
                </button>
                <button
                  style={toggleView(activeView === 'tracked')}
                  onClick={() => setActiveView('tracked')}
                  disabled={isLoading}
                >
                  Tracked Changes
                </button>

                {/* Copy button right after Tracked Changes */}
                <button 
                  onClick={handleCopy} 
                  style={{ 
                    ...buttonBase, 
                    backgroundColor: theme.secondary,
                    opacity: clipboardSupported ? 1 : 0.6,
                    cursor: clipboardSupported && !isLoading ? 'pointer' : 'not-allowed',
                    fontSize: '14px',
                    padding: '6px 12px',
                    minWidth: 'max-content',
                  }}
                  disabled={!clipboardSupported || isLoading}
                  title={!clipboardSupported ? 'Clipboard API not supported in your browser' : activeView === 'tracked' ? 'Copy with tracked changes formatting for Word' : 'Copy clean text'}
                >
                  📋 Copy{activeView === 'tracked' ? ' with formatting' : ''}
                </button>
              </div>
            </div>
          )}
          
          <div style={{ ...resultBox, display: activeView === 'clean' ? 'block' : 'none' }}>
            {isLoading && wordCount > 1000 ? (
              <div style={{ color: theme.textLight, fontStyle: 'italic' }}>
                Processing document... Results will appear below
              </div>
            ) : resultClean}
          </div>
          <div
            style={{ ...resultBox, display: activeView === 'tracked' ? 'block' : 'none' }}
            dangerouslySetInnerHTML={{ 
              __html: isLoading && wordCount > 1000
                ? '<div style="color: #666; font-style: italic;">Processing document... Tracked changes will appear below</div>'
                : resultTracked
            }}
          />
          {!isLoading && hasResults && (
            <div style={{ marginTop: '8px', fontWeight: 'bold', color: changesCount > 0 ? theme.primary : theme.textLight }}>
              {changesCount.toLocaleString()} change{changesCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Documents Panel */}
        <div style={sectionBase}>
          <input
            type="text"
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
            placeholder="Document name (optional)"
            style={inputStyle}
            disabled={isLoading}
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
            {hasResults && (
              <>
                <button 
                  onClick={handleSaveNew} 
                  style={{ 
                    ...buttonBase, 
                    backgroundColor: theme.success,
                  }}
                >
                  💾 Save New Document
                </button>
                {currentDocumentId && (
                  <button 
                    onClick={handleSaveProgress} 
                    style={{ 
                      ...buttonBase, 
                      backgroundColor: theme.warning,
                    }}
                  >
                    🔁 Save Progress
                  </button>
                )}
              </>
            )}
            <button 
              onClick={toggleDocuments} 
              style={{ 
                ...buttonBase, 
                backgroundColor: showDocuments ? theme.danger : theme.info,
              }}
            >
              {showDocuments ? '↑ Hide Documents' : '↓ Show Documents'}
            </button>
          </div>
        </div>

        {/* Saved Documents */}
        {showDocuments && (
          <div style={{ ...sectionBase, marginTop: '20px' }}>
            <h3 style={{ marginTop: 0 }}>Saved Documents</h3>
            {savedDocuments.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  color: theme.textLight,
                  padding: '15px',
                  fontStyle: 'italic',
                  border: `1px dashed ${theme.border}`,
                  borderRadius: '4px',
                }}
              >
                No saved documents yet
              </div>
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {savedDocuments.map((doc: SavedDocument) => (
                  <div 
                    key={doc.id} 
                    style={{
                      ...documentItemStyle,
                      borderLeft: doc.id === currentDocumentId ? `4px solid ${theme.primary}` : 'none',
                      paddingLeft: doc.id === currentDocumentId ? '6px' : '10px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '5px',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 'bold',
                          fontSize: '14px',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        }}
                        onClick={() => loadDocument(doc)}
                        title={`Load: ${doc.name}`}
                      >
                        {doc.name}
                      </div>
                      <div style={{ fontSize: '12px', color: theme.textLight, flexShrink: 0 }}>
                        {new Date(doc.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          border: `1px solid ${theme.border}`,
                          background: 'white',
                          cursor: 'pointer',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: theme.secondary,
                          transition: 'all 0.2s',
                        }}
                        title="Open document"
                        onClick={() => loadDocument(doc)}
                      >
                        ↗
                      </button>
                      <button
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          border: `1px solid ${theme.border}`,
                          background: 'white',
                          cursor: 'pointer',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: theme.danger,
                          transition: 'all 0.2s',
                        }}
                        title="Delete document"
                        onClick={() => deleteDocument(doc.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EditorUI;