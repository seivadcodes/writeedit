'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSavedDocuments, SavedDocument } from '@/hooks/useSavedDocuments';
import * as Diff from 'diff';

// --- Types ---
interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

// --- Theme & Styles (unchanged) ---
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

// --- Helper Functions ---

const generateEditableTrackedHtml = (originalText: string, editedText: string) => {
  const diff = Diff.diffWords(originalText, editedText, { ignoreCase: false }) as DiffPart[];
  let html = '';
  let changes = 0;

  diff.forEach((part) => {
    if (part.added) {
      changes++;
      html += `<span class="tracked-change inserted" style="background:#e6ffe6;text-decoration:underline;position:relative;display:inline-block;cursor:pointer;">${part.value}<span class="change-controls" style="position:absolute;top:-25px;right:0;display:flex;gap:4px;opacity:0;visibility:hidden;transition:opacity 0.2s,visibility 0.2s;background:white;border:1px solid #ddd;border-radius:4px;padding:2px 4px;box-shadow:0 2px 4px rgba(0,0,0,0.1);z-index:1000;"><button class="accept-change" style="width:20px;height:20px;border-radius:50%;border:1px solid #4CAF50;background:#4CAF50;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;color:white;transition:all 0.2s;">✓</button><button class="reject-change" style="width:20px;height:20px;border-radius:50%;border:1px solid #f44336;background:#f44336;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;color:white;transition:all 0.2s;">✕</button></span></span>`;
    } else if (part.removed) {
      changes++;
      html += `<span class="tracked-change deleted" style="background:#ffe6e6;text-decoration:line-through;position:relative;display:inline-block;cursor:pointer;">${part.value}<span class="change-controls" style="position:absolute;top:-25px;right:0;display:flex;gap:4px;opacity:0;visibility:hidden;transition:opacity 0.2s,visibility 0.2s;background:white;border:1px solid #ddd;border-radius:4px;padding:2px 4px;box-shadow:0 2px 4px rgba(0,0,0,0.1);z-index:1000;"><button class="accept-change" style="width:20px;height:20px;border-radius:50%;border:1px solid #4CAF50;background:#4CAF50;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;color:white;transition:all 0.2s;">✓</button><button class="reject-change" style="width:20px;height:20px;border-radius:50%;border:1px solid #f44336;background:#f44336;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;color:white;transition:all 0.2s;">✕</button></span></span>`;
    } else {
      html += part.value;
    }
  });

  return { html, changes };
};

// --- Main Component ---
const TrackedChangesViewer = () => {
  const {
    savedDocuments,
    currentDocumentId,
    saveProgressToCurrentDocument,
    setCurrentDocument,
    deleteDocument,
  } = useSavedDocuments();

  const [selectedDocument, setSelectedDocument] = useState<SavedDocument | null>(null);
  const [currentText, setCurrentText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'warning' | 'error' | 'info';
    message: string;
    show: boolean;
  }>({
    type: 'info',
    message: '',
    show: false,
  });
  const [showAllChanges, setShowAllChanges] = useState(true);
  const [changesCount, setChangesCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Inject styles for hover effects
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .tracked-change:hover .change-controls {
        opacity: 1 !important;
        visibility: visible !important;
      }
      #tracked-changes-container {
        position: relative;
        min-height: 100px;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Auto-select first document if none selected
  useEffect(() => {
    if (savedDocuments.length > 0 && !selectedDocument) {
      setSelectedDocument(savedDocuments[0]);
      setCurrentText(savedDocuments[0].editedText);
    }
  }, [savedDocuments, selectedDocument]);

  // Update text and changes count when document changes
  useEffect(() => {
    if (selectedDocument) {
      setCurrentText(selectedDocument.editedText);
      const { changes } = generateEditableTrackedHtml(
        selectedDocument.originalText,
        selectedDocument.editedText
      );
      setChangesCount(changes);
    }
  }, [selectedDocument]);

  const handleDocumentSelect = (doc: SavedDocument) => {
    setSelectedDocument(doc);
    setCurrentText(doc.editedText);
    setCurrentDocument(doc.id);

    const { changes } = generateEditableTrackedHtml(doc.originalText, doc.editedText);
    setChangesCount(changes);
  };

  const handleSaveProgress = () => {
    if (!selectedDocument) return;

    const success = saveProgressToCurrentDocument({
      originalText: selectedDocument.originalText,
      editedText: currentText,
    });

    if (success) {
      setStatus({ type: 'success', message: 'Progress saved!', show: true });
      setTimeout(() => setStatus((prev) => ({ ...prev, show: false })), 2000);
    } else {
      setStatus({ type: 'error', message: 'Failed to save progress', show: true });
      setTimeout(() => setStatus((prev) => ({ ...prev, show: false })), 2000);
    }
  };

  const handleAcceptChange = useCallback((element: HTMLElement, isDeleted: boolean) => {
    if (isDeleted) {
      // For deleted text: remove the element entirely when accepted
      element.remove();
    } else {
      // For inserted text: keep the text but remove tracking styles
      const textContent = element.textContent || '';
      const parent = element.parentNode;
      if (parent) {
        const textNode = document.createTextNode(textContent);
        parent.replaceChild(textNode, element);
      }
    }
    updateTextFromDOM();
  }, []);

  const handleRejectChange = useCallback((element: HTMLElement, isDeleted: boolean) => {
    if (isDeleted) {
      // For deleted text: restore the text when rejected
      const textContent = element.textContent || '';
      const parent = element.parentNode;
      if (parent) {
        const textNode = document.createTextNode(textContent);
        parent.replaceChild(textNode, element);
      }
    } else {
      // For inserted text: remove the text when rejected
      element.remove();
    }
    updateTextFromDOM();
  }, []);

  const updateTextFromDOM = useCallback(() => {
    if (containerRef.current) {
      const tempDiv = containerRef.current.cloneNode(true) as HTMLDivElement;
      
      // Remove change controls and tracking styles
      tempDiv.querySelectorAll('.change-controls').forEach(el => el.remove());
      tempDiv.querySelectorAll('.tracked-change').forEach(el => {
        const textContent = el.textContent || '';
        const textNode = document.createTextNode(textContent);
        el.parentNode?.replaceChild(textNode, el);
      });
      
      // Get clean text content
      const plainText = tempDiv.textContent || '';
      setCurrentText(plainText);
      
      // Update changes count
      if (selectedDocument) {
        const { changes } = generateEditableTrackedHtml(selectedDocument.originalText, plainText);
        setChangesCount(changes);
      }
    }
  }, [selectedDocument]);

  // Event delegation for accept/reject buttons
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      if (target.classList.contains('accept-change') || 
          target.classList.contains('reject-change')) {
        e.stopPropagation();
        
        const changeElement = target.closest('.tracked-change') as HTMLElement;
        if (!changeElement) return;
        
        const isDeleted = changeElement.classList.contains('deleted');
        
        if (target.classList.contains('accept-change')) {
          handleAcceptChange(changeElement, isDeleted);
        } else {
          handleRejectChange(changeElement, isDeleted);
        }
      }
    };

    container.addEventListener('click', handleClick);
    
    return () => {
      container.removeEventListener('click', handleClick);
    };
  }, [handleAcceptChange, handleRejectChange]);

  // Update tracked HTML when current text or document changes
  useEffect(() => {
    if (selectedDocument && containerRef.current) {
      const { html, changes } = generateEditableTrackedHtml(
        selectedDocument.originalText,
        currentText
      );
      
      containerRef.current.innerHTML = html;
      setChangesCount(changes);
    }
  }, [selectedDocument, currentText]);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={containerStyle}>
        <h1 style={headingStyle}>Saved Documents</h1>

        <div style={{ display: 'flex', gap: '20px' }}>
          {/* Document List */}
          <div style={{ width: '30%', minWidth: '250px', borderRight: `1px solid ${theme.border}`, paddingRight: '20px' }}>
            <h3 style={{ marginBottom: '10px' }}>Saved Documents</h3>

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
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {savedDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      ...documentItemStyle,
                      backgroundColor: selectedDocument?.id === doc.id ? '#e6f7ff' : 'white',
                      border: selectedDocument?.id === doc.id ? `1px solid ${theme.primary}` : '1px solid #eee',
                    }}
                    onClick={() => handleDocumentSelect(doc)}
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
                        }}
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
                          border: `1px solid ${theme.secondary}`,
                          background: 'white',
                          cursor: 'pointer',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: theme.secondary,
                          transition: 'all 0.2s',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDocumentSelect(doc);
                        }}
                        title="Open document"
                      >
                        ↗
                      </button>
                      <button
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          border: `1px solid ${theme.danger}`,
                          background: 'white',
                          cursor: 'pointer',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: theme.danger,
                          transition: 'all 0.2s',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete document "${doc.name}"?`)) {
                            deleteDocument(doc.id);
                          }
                        }}
                        title="Delete document"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tracked Changes Viewer */}
          <div style={{ flex: 1 }}>
            {selectedDocument ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0 }}>Tracked Changes Viewer</h3>
                  <button
                    onClick={handleSaveProgress}
                    style={{
                      ...buttonBase,
                      backgroundColor: theme.success,
                      fontSize: '14px',
                      padding: '6px 12px',
                    }}
                  >
                    💾 Save Progress
                  </button>
                </div>

                {status.show && <div style={statusStyle(status.type)}>{status.message}</div>}

                <div style={{ marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: theme.textLight }}>
                    {changesCount} change{changesCount !== 1 ? 's' : ''}
                  </span>
                  <button
                    style={{
                      ...buttonBase,
                      backgroundColor: theme.info,
                      fontSize: '12px',
                      padding: '4px 8px',
                    }}
                    onClick={() => setShowAllChanges(!showAllChanges)}
                  >
                    {showAllChanges ? 'Hide All Changes' : 'Show All Changes'}
                  </button>
                </div>

                <div
                  id="tracked-changes-container"
                  ref={containerRef}
                  style={{
                    ...resultBox,
                    padding: '15px',
                    fontSize: '16px',
                    lineHeight: '1.8',
                    position: 'relative',
                  }}
                />

                {isEditing && (
                  <div style={{ marginTop: '15px' }}>
                    <textarea
                      value={currentText}
                      onChange={(e) => setCurrentText(e.target.value)}
                      placeholder="Edit the text directly..."
                      style={{ ...textareaStyle, minHeight: '200px' }}
                    />
                  </div>
                )}

                <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    style={{
                      ...buttonBase,
                      backgroundColor: theme.warning,
                      fontSize: '14px',
                      padding: '6px 12px',
                    }}
                  >
                    {isEditing ? 'Cancel Edit' : 'Edit Text Directly'}
                  </button>
                  <button
                    onClick={handleSaveProgress}
                    style={{
                      ...buttonBase,
                      backgroundColor: theme.success,
                      fontSize: '14px',
                      padding: '6px 12px',
                    }}
                  >
                    Save Progress
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '50px', color: theme.textLight }}>
                Select a document from the list to view its tracked changes.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackedChangesViewer;