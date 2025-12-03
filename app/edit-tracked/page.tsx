'use client';

import { useEffect, useRef, useState } from 'react';
import * as Diff from 'diff';

// Types
type SavedDoc = {
  id: string;
  name: string;
  timestamp: number;
  originalText: string;
  editedText: string;
  trackedHtml: string;
};

const SAVED_KEY = 'saved_documents';

export default function EditTrackedPage() {
  const [docs, setDocs] = useState<SavedDoc[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [originalText, setOriginalText] = useState('');
  const [editedText, setEditedText] = useState('');
  const [originalTrackedHtml, setOriginalTrackedHtml] = useState('');
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  const trackedRef = useRef<HTMLDivElement>(null);
  const cleanRef = useRef<HTMLDivElement>(null);
  const isApplyingChangeRef = useRef(false);

  // ------------------ UTILITIES ------------------

  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const generateDiffHtml = (original: string, edited: string): string => {
    const diffs = Diff.diffWords(original, edited);
    let html = '';
    let groupContent = '';
    let inGroup = false;

    const flushGroup = (isChangeGroup: boolean) => {
      if (groupContent) {
        if (isChangeGroup) {
          html += `<span class="change-group">${groupContent}</span>`;
        } else {
          html += groupContent;
        }
        groupContent = '';
      }
      inGroup = false;
    };

    const areWordsSimilar = (word1: string, word2: string) => {
      if (!word1 || !word2) return false;
      const lenDiff = Math.abs(word1.length - word2.length);
      if (lenDiff > Math.max(word1.length, word2.length) * 0.4) return false;
      let common = 0, i = 0, j = 0;
      while (i < word1.length && j < word2.length) {
        if (word1[i] === word2[j]) {
          common++; i++; j++;
        } else {
          if (i < word1.length - 1 && word1[i + 1] === word2[j]) i++;
          else if (j < word2.length - 1 && word1[i] === word2[j + 1]) j++;
          else { i++; j++; }
        }
      }
      return common / Math.max(word1.length, word2.length) >= 0.6;
    };

    for (let i = 0; i < diffs.length; i++) {
      const part = diffs[i];
      if (!part.added && !part.removed) {
        flushGroup(false);
        html += escapeHtml(part.value);
        continue;
      }

      if (!inGroup) {
        groupContent = '';
        inGroup = true;
      }

      if (part.removed) {
        groupContent += `<del>${escapeHtml(part.value)}</del>`;
      } else if (part.added) {
        groupContent += `<ins>${escapeHtml(part.value)}</ins>`;
      }

      const next = diffs[i + 1];
      if (!next || (!next.added && !next.removed)) {
        flushGroup(true);
      } else if (inGroup && part.added && next.removed) {
        flushGroup(true);
      } else if (inGroup && part.removed && next.added) {
        if (!areWordsSimilar(part.value.trim(), next.value.trim())) {
          flushGroup(true);
        }
      }
    }
    flushGroup(inGroup);
    return `<div style="white-space:pre-wrap">${html}</div>`;
  };

  const updateCleanFromTracked = () => {
    if (!trackedRef.current) return;
    const clone = trackedRef.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.change-action, .change-group').forEach(el => el.remove());
    clone.querySelectorAll('del').forEach(el => el.remove());
    clone.querySelectorAll('ins').forEach(ins => {
      const parent = ins.parentNode!;
      while (ins.firstChild) parent.insertBefore(ins.firstChild, ins);
      parent.removeChild(ins);
    });
    const cleanText = clone.textContent || '';
    setEditedText(cleanText);
    if (cleanRef.current) cleanRef.current.textContent = cleanText;
  };

  const attachAcceptRejectHandlers = () => {
    if (!trackedRef.current) return;
    trackedRef.current.querySelectorAll('.change-action').forEach(el => el.remove());
    trackedRef.current.querySelectorAll('.change-group').forEach(group => {
      if (group.querySelector('.change-action')) return;
      const action = document.createElement('div');
      action.className = 'change-action';
      action.innerHTML = `
        <button class="accept-change" title="Accept">✅</button>
        <button class="reject-change" title="Reject">❌</button>
      `;
      group.appendChild(action);

      action.querySelector('.accept-change')!.addEventListener('click', (e) => {
        e.stopPropagation();
        applyChange(group as HTMLElement, true);
      });
      action.querySelector('.reject-change')!.addEventListener('click', (e) => {
        e.stopPropagation();
        applyChange(group as HTMLElement, false);
      });
    });
  };

  const applyChange = (group: HTMLElement, accept: boolean) => {
    isApplyingChangeRef.current = true;

    if (accept) {
      group.querySelectorAll('ins').forEach(ins => {
        const parent = ins.parentNode!;
        while (ins.firstChild) parent.insertBefore(ins.firstChild, ins);
        parent.removeChild(ins);
      });
      group.querySelectorAll('del').forEach(del => del.remove());
    } else {
      group.querySelectorAll('del').forEach(del => {
        const parent = del.parentNode!;
        while (del.firstChild) parent.insertBefore(del.firstChild, del);
        parent.removeChild(del);
      });
      group.querySelectorAll('ins').forEach(ins => ins.remove());
    }

    if (group.childNodes.length === 0) {
      group.remove();
    } else {
      while (group.firstChild) {
        group.parentNode!.insertBefore(group.firstChild, group);
      }
      group.remove();
    }

    updateCleanFromTracked();
    autoSaveProgress();
    attachAcceptRejectHandlers();
    isApplyingChangeRef.current = false;
  };

  const performDeletion = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    if (!fragment.textContent?.trim()) return;

    const tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);
    const safeText = tempDiv.textContent;

    const del = document.createElement('del');
    del.textContent = safeText;

    const group = document.createElement('span');
    group.className = 'change-group';
    group.appendChild(del);

    range.deleteContents();
    range.insertNode(group);

    updateCleanFromTracked();
    updateUnsavedState();
  };

  const handleDeletion = (isForward = false) => {
    if (isApplyingChangeRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    trackedRef.current?.querySelectorAll('.change-action').forEach(el => el.remove());

    let range;
    if (selection.isCollapsed) {
      range = selection.getRangeAt(0).cloneRange();
      if (isForward) {
        range.setEnd(range.endContainer, Math.min(range.endOffset + 1, range.endContainer.textContent?.length || 0));
      } else {
        if (range.startOffset === 0) return;
        range.setStart(range.startContainer, range.startOffset - 1);
      }
      if (range.toString().trim() === '') return;
    } else {
      range = selection.getRangeAt(0);
      if (!range.toString().trim()) return;
    }

    selection.removeAllRanges();
    selection.addRange(range);
    performDeletion();

    const afterRange = document.createRange();
    afterRange.setStart(range.startContainer, range.startOffset);
    afterRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(afterRange);

    attachAcceptRejectHandlers();
  };

  const insertTrackedInsertion = (text: string) => {
    if (!text || isApplyingChangeRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const ins = document.createElement('ins');
    ins.textContent = text;

    const group = document.createElement('span');
    group.className = 'change-group';
    group.appendChild(ins);

    range.insertNode(group);

    const newRange = document.createRange();
    newRange.setStartAfter(group);
    newRange.setEndAfter(group);
    selection.removeAllRanges();
    selection.addRange(newRange);

    updateCleanFromTracked();
    updateUnsavedState();
    attachAcceptRejectHandlers();
  };

  const updateUnsavedState = () => {
    if (!trackedRef.current) return;
    const isDirty = trackedRef.current.innerHTML !== originalTrackedHtml;
    setUnsavedChanges(isDirty);
  };

  // ------------------ STORAGE ------------------

  const autoSaveProgress = () => {
    if (!currentId) {
      const newId = Date.now().toString();
      setCurrentId(newId);
      const newDoc: SavedDoc = {
        id: newId,
        name: 'Untitled Document',
        timestamp: Date.now(),
        originalText: originalText || editedText,
        editedText,
        trackedHtml: trackedRef.current?.innerHTML || '',
      };
      const updated = [newDoc, ...docs];
      setDocs(updated);
      localStorage.setItem(SAVED_KEY, JSON.stringify(updated));
      setOriginalTrackedHtml(newDoc.trackedHtml);
      return;
    }

    const idx = docs.findIndex(d => d.id === currentId);
    if (idx === -1) return;

    const updatedDoc = {
      ...docs[idx],
      originalText: originalText || editedText,
      editedText,
      trackedHtml: trackedRef.current?.innerHTML || '',
      timestamp: Date.now(),
    };

    const updated = [...docs];
    updated[idx] = updatedDoc;
    setDocs(updated);
    localStorage.setItem(SAVED_KEY, JSON.stringify(updated));
    setOriginalTrackedHtml(updatedDoc.trackedHtml);
    renderDocList();
  };

  const saveProgress = () => {
    autoSaveProgress();
    alert('Progress saved!');
    setUnsavedChanges(false);
  };

  const renderDocList = () => {
    // No-op: we use React state
  };

  const loadDoc = (id: string) => {
    const doc = docs.find(d => d.id === id);
    if (!doc) return;

    setCurrentId(id);
    setOriginalText(doc.originalText);
    setEditedText(doc.editedText);
    setOriginalTrackedHtml(doc.trackedHtml);

    if (trackedRef.current) {
      trackedRef.current.innerHTML = doc.trackedHtml || generateDiffHtml(doc.originalText, doc.editedText);
      setTimeout(() => {
        attachAcceptRejectHandlers();
        updateCleanFromTracked();
      }, 0);
    }

    setUnsavedChanges(false);
  };

  // ------------------ EFFECTS ------------------

  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem(SAVED_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setDocs(parsed);
      } catch (e) {
        console.error('Failed to parse saved docs');
      }
    }
  }, []);

  useEffect(() => {
    if (!trackedRef.current) return;
    const div = trackedRef.current;
    div.contentEditable = 'true';

    const beforeinputHandler = (e: InputEvent) => {
  if (isApplyingChangeRef.current) return;
  if (e.inputType === 'insertText' && e.data) {
    e.preventDefault();
    insertTrackedInsertion(e.data);
  }
  // Skip 'insertFromPaste' — handled by 'paste' event
};

    const pasteHandler = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') || '';
      insertTrackedInsertion(text);
    };

    const keydownHandler = (e: KeyboardEvent) => {
      if (isApplyingChangeRef.current) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleDeletion(e.key === 'Delete');
      }
    };

    div.addEventListener('beforeinput', beforeinputHandler as EventListener);
    div.addEventListener('paste', pasteHandler);
    div.addEventListener('keydown', keydownHandler);

    return () => {
      div.removeEventListener('beforeinput', beforeinputHandler as EventListener);
      div.removeEventListener('paste', pasteHandler);
      div.removeEventListener('keydown', keydownHandler);
    };
  }, []);

  useEffect(() => {
    if (trackedRef.current) {
      const observer = new MutationObserver(() => {
        updateUnsavedState();
      });
      observer.observe(trackedRef.current, { childList: true, subtree: true, characterData: true });
      return () => observer.disconnect();
    }
  }, []);

  // ------------------ RENDER ------------------

  return (
    <div className="font-sans">
      <style jsx global>{`
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #fafafa;
          color: #333;
        }
        #sidebar {
          width: 260px;
          background: #fff;
          border-right: 1px solid #eee;
          padding: 16px;
          overflow-y: auto;
          height: 100vh;
          position: fixed;
          top: 0;
          left: 0;
        }
        #sidebar h3 {
          margin-bottom: 12px;
          font-size: 16px;
        }
        .doc-item {
          padding: 10px;
          margin-bottom: 8px;
          background: white;
          border: 1px solid #eee;
          border-radius: 5px;
          cursor: pointer;
        }
        .doc-item:hover { background: #f9f9f9; }
        .doc-item.active { border-left: 4px solid #4CAF50; background: #f0f8f0; }
        .doc-name { font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .doc-date { font-size: 11px; color: #777; margin-top: 4px; }

        #main {
          margin-left: 260px;
          padding: 20px;
          min-height: 100vh;
        }
        .view {
          margin-top: 16px;
        }
        .view h3 {
          margin-bottom: 6px;
          color: #555;
          font-size: 14px;
        }
        .content-box {
          padding: 12px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 6px;
          white-space: pre-wrap;
          font-size: 14px;
          max-height: 40vh;
          overflow-y: auto;
        }

        del {
          background-color: #ffe6e6;
          text-decoration: line-through;
          margin: 0 2px;
          display: inline;
        }
        ins {
          background-color: #e6ffe6;
          text-decoration: none;
          margin: 0 2px;
          display: inline;
        }

        .change-group {
          position: relative;
          display: inline-block;
          white-space: nowrap;
        }

        .change-action {
          position: absolute;
          top: -22px;
          left: 0;
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 2px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          z-index: 100;
          gap: 4px;
          align-items: center;
          display: none;
          flex-direction: row;
        }

        .change-action button {
          padding: 2px 6px;
          font-size: 12px;
          border: 1px solid #ccc;
          border-radius: 3px;
          background: white;
          cursor: pointer;
        }
        .change-action button:hover {
          background: #f0f0f0;
        }
        .change-action button.accept-change { color: green; }
        .change-action button.reject-change { color: red; }

        .change-group:hover .change-action {
          display: flex !important;
        }

        #no-doc { color: #888; font-style: italic; }
        #save-btn {
          margin-top: 12px;
          padding: 8px 16px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        #save-btn:hover {
          background: #45a049;
        }
        #save-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        #placeholder { color: #777; font-style: italic; }
      `}</style>

      {/* Sidebar */}
      <div id="sidebar">
        <h3>Saved Documents</h3>
        <div id="doc-list">
          {docs.length === 0 ? (
            <div id="no-doc">No documents saved</div>
          ) : (
            docs.map((doc) => (
              <div
                key={doc.id}
                className={`doc-item ${doc.id === currentId ? 'active' : ''}`}
                onClick={() => loadDoc(doc.id)}
              >
                <div className="doc-name">{doc.name}</div>
                <div className="doc-date">
                  {new Date(doc.timestamp).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main */}
      <div id="main">
        <h2>Tracked Changes Viewer (editor.js Compatible)</h2>
        {currentId === null ? (
          <p id="placeholder">Select a document from the sidebar.</p>
        ) : (
          <div id="document-content">
            <div className="view">
              <h3>Tracked Changes</h3>
              <div
                id="tracked"
                ref={trackedRef}
                className="content-box"
                style={{ outline: 'none' }}
              ></div>
              <button
                id="save-btn"
                onClick={saveProgress}
                disabled={!unsavedChanges}
              >
                💾 Save Progress
              </button>
            </div>
            <div className="view">
              <h3>Clean Text</h3>
              <div
                id="clean"
                ref={cleanRef}
                className="content-box"
                contentEditable={false}
              ></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}