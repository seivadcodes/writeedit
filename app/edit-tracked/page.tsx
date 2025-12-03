'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor } from '@/hooks/useEditor';
import { useDocument, SavedDocument } from '@/hooks/useDocument';

export default function EditTrackedPage() {
  const editor = useEditor();
  const docManager = useDocument();

  const {
    documents,
    isLoading: isDocLoading,
    error: docError,
    saveProgress: saveProgressToApi,
    deleteDocument,
  } = docManager;

  const {
    inputText,
    editedText,
    documentId,
    setViewMode,
    setInputText,
    setDocumentId,
  } = editor;

  const [currentDoc, setCurrentDoc] = useState<SavedDocument | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [trackedHtmlState, setTrackedHtmlState] = useState<string>('');
  const trackedRef = useRef<HTMLDivElement>(null);
  const isApplyingChangeRef = useRef(false);

  // === Escape HTML ===
  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  // === Generate diff HTML (only used on load) ===
  const generateDiffHtml = (original: string, edited: string): string => {
    if (typeof window === 'undefined') return escapeHtml(edited);
    const DiffLib = (window as any).Diff;
    if (!DiffLib) return escapeHtml(edited);

    try {
      const diffs = DiffLib.diffWords(original, edited);
      let html = '';
      let inGroup = false;
      let groupContent = '';

      const flush = (isChange: boolean) => {
        if (groupContent) {
          html += isChange ? `<span class="change-group">${groupContent}</span>` : groupContent;
          groupContent = '';
        }
        inGroup = false;
      };

      for (let i = 0; i < diffs.length; i++) {
        const part = diffs[i];
        if (!part.added && !part.removed) {
          flush(false);
          html += escapeHtml(part.value);
        } else {
          if (!inGroup) {
            groupContent = '';
            inGroup = true;
          }
          if (part.removed) groupContent += `<del>${escapeHtml(part.value)}</del>`;
          else if (part.added) groupContent += `<ins>${escapeHtml(part.value)}</ins>`;

          const next = diffs[i + 1];
          if (!next || (!next.added && !next.removed)) flush(true);
        }
      }
      flush(false);
      return `<div style="white-space:pre-wrap">${html}</div>`;
    } catch {
      return escapeHtml(edited);
    }
  };

  // === Sync tracked HTML → clean text & update editor ===
  const syncToClean = useCallback(() => {
    if (!trackedRef.current) return;
    const clone = trackedRef.current.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.change-action, .change-group').forEach(el => el.remove());
    clone.querySelectorAll('del').forEach(el => el.remove());
    clone.querySelectorAll('ins').forEach(el => {
      const parent = el.parentNode!;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });
    const cleanText = clone.textContent || '';
    editor.setEditedText(cleanText); // ✅ Real-time sync
    setUnsavedChanges(true);
  }, [editor]);

  // === Apply change (accept/reject) ===
  const applyChange = useCallback((group: HTMLElement, accept: boolean) => {
    if (isApplyingChangeRef.current) return;
    isApplyingChangeRef.current = true;

    if (accept) {
      group.querySelectorAll('ins').forEach(ins => {
        const p = ins.parentNode!;
        while (ins.firstChild) p.insertBefore(ins.firstChild, ins);
        p.removeChild(ins);
      });
      group.querySelectorAll('del').forEach(el => el.remove());
    } else {
      group.querySelectorAll('del').forEach(del => {
        const p = del.parentNode!;
        while (del.firstChild) p.insertBefore(del.firstChild, del);
        p.removeChild(del);
      });
      group.querySelectorAll('ins').forEach(el => el.remove());
    }

    if (group.childNodes.length === 0) {
      group.remove();
    } else {
      while (group.firstChild) group.parentNode!.insertBefore(group.firstChild, group);
      group.remove();
    }

    syncToClean();
    isApplyingChangeRef.current = false;
  }, [syncToClean]);

  // === Insert text as <ins> ===
  const insertTrackedText = (text: string) => {
    if (!trackedRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    range.deleteContents();

    const ins = document.createElement('ins');
    ins.textContent = text;
    const group = document.createElement('span');
    group.className = 'change-group';
    group.appendChild(ins);
    range.insertNode(group);

    // Move cursor after insertion
    const newRange = document.createRange();
    newRange.setStartAfter(group);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    syncToClean();
    attachHandlers();
  };

  // === Handle deletion as <del> ===
  const handleDeletion = (isForward = false) => {
    if (!trackedRef.current) return;
    const sel = window.getSelection();
    if (!sel) return;

    let range: Range;
    if (sel.isCollapsed) {
      range = sel.getRangeAt(0).cloneRange();
      if (isForward) {
        range.setEnd(range.endContainer, range.endOffset + 1);
      } else {
        if (range.startOffset === 0) return;
        range.setStart(range.startContainer, range.startOffset - 1);
      }
      if (range.toString().trim() === '') return;
    } else {
      range = sel.getRangeAt(0);
      if (!range.toString().trim()) return;
    }

    sel.removeAllRanges();
    sel.addRange(range);

    const content = range.cloneContents();
    if (!content.textContent?.trim()) return;

    const temp = document.createElement('div');
    temp.appendChild(content);
    const text = temp.textContent;

    range.deleteContents();

    const del = document.createElement('del');
    del.textContent = text;
    const group = document.createElement('span');
    group.className = 'change-group';
    group.appendChild(del);
    range.insertNode(group);

    syncToClean();
    attachHandlers();
  };

  // === Attach accept/reject buttons ===
  const attachHandlers = () => {
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
      action.querySelector('.accept-change')?.addEventListener('click', (e) => {
        e.stopPropagation();
        applyChange(group as HTMLElement, true);
      });
      action.querySelector('.reject-change')?.addEventListener('click', (e) => {
        e.stopPropagation();
        applyChange(group as HTMLElement, false);
      });
    });
  };

  // === Setup editable behavior ===
  useEffect(() => {
    if (!trackedRef.current) return;

    const div = trackedRef.current;
    let isDown = false;

    const handleBeforeInput = (e: InputEvent) => {
      if (isApplyingChangeRef.current) return;
      e.preventDefault();
      if (e.inputType === 'insertText' && e.data) {
        insertTrackedText(e.data);
      } else if (e.inputType === 'insertFromPaste') {
        const text = (e as any).dataTransfer?.getData('text/plain') || '';
        insertTrackedText(text);
      } else if (e.inputType === 'deleteContentBackward') {
        handleDeletion(false);
      } else if (e.inputType === 'deleteContentForward') {
        handleDeletion(true);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isApplyingChangeRef. current) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleDeletion(e.key === 'Delete');
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        insertTrackedText('\n');
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') || '';
      insertTrackedText(text);
    };

    const handleClick = () => {
      if (!isDown) attachHandlers();
    };

    div.addEventListener('beforeinput', handleBeforeInput as EventListener);
    div.addEventListener('keydown', handleKeyDown as EventListener);
    div.addEventListener('paste', handlePaste as EventListener);
    div.addEventListener('mouseup', handleClick);
    div.addEventListener('touchend', handleClick);

    return () => {
      div.removeEventListener('beforeinput', handleBeforeInput as EventListener);
      div.removeEventListener('keydown', handleKeyDown as EventListener);
      div.removeEventListener('paste', handlePaste as EventListener);
      div.removeEventListener('mouseup', handleClick);
      div.removeEventListener('touchend', handleClick);
    };
  }, [applyChange]);

  // === Load document ===
  const loadDocument = useCallback((doc: SavedDocument) => {
    editor.loadDocument(doc.id, {
      originalText: doc.original_text,
      editedText: doc.edited_text,
      level: doc.level,
      model: doc.model,
      customInstruction: doc.custom_instruction,
    });
    setCurrentDoc(doc);
    setDocumentId(doc.id);
    setViewMode('tracked');
    const html = doc.tracked_html || generateDiffHtml(doc.original_text, doc.edited_text);
    setTrackedHtmlState(html);
    setUnsavedChanges(false);
    setTimeout(() => {
      if (trackedRef.current) {
        trackedRef.current.innerHTML = html;
        attachHandlers();
      }
    }, 0);
  }, [editor, setDocumentId, setViewMode]);

  // === Save ===
  const saveProgress = async () => {
    if (!documentId || !currentDoc) {
      setSaveError('No active document');
      return;
    }
    setIsSaving(true);
    try {
      const html = trackedRef.current?.innerHTML || null;
      await saveProgressToApi(documentId, editedText, inputText, html ?? undefined);
      setUnsavedChanges(false);
      alert('✅ Saved!');
    } catch (err: any) {
      setSaveError(err.message || 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  // === Detect unsaved ===
  useEffect(() => {
    if (currentDoc) {
      const hasChanges = trackedRef.current?.innerHTML !== (currentDoc.tracked_html || '');
      setUnsavedChanges(!!hasChanges);
    }
  }, [trackedHtmlState, currentDoc, editedText]);

  // === Load diff.js ===
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).Diff) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/diff@5.1.0/dist/diff.min.js';
      document.head.appendChild(script);
      return () => {
        document.head.removeChild(script);
      };
    }
  }, []);

  return (
    <div className="flex h-screen bg-[#fafafa] text-[#333]">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-[#eee] p-4 overflow-y-auto">
        <h3 className="text-sm font-semibold mb-3">Saved Documents</h3>
        {isDocLoading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : documents.length === 0 ? (
          <p className="text-gray-500 text-sm">No documents saved</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                onClick={() => loadDocument(doc)}
                className={`p-2.5 rounded cursor-pointer border ${
                  doc.id === documentId
                    ? 'border-l-4 border-l-green-500 bg-[#f0f8f0]'
                    : 'border-[#eee] hover:bg-[#f9f9f9]'
                }`}
              >
                <div className="font-bold text-sm truncate">{doc.name}</div>
                <div className="text-xs text-[#777] mt-1">
                  {new Date(doc.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
        {docError && <p className="text-red-600 text-xs mt-2">{docError}</p>}
      </div>

      {/* Main */}
      <div className="flex-1 p-5 overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Tracked Changes Viewer</h2>

        {!currentDoc ? (
          <p className="text-gray-500 italic">Select a document from the sidebar.</p>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm text-[#555] font-medium">Tracked Changes</h3>
              <button
                onClick={saveProgress}
                disabled={!unsavedChanges || isSaving}
                className={`px-3 py-1.5 text-sm rounded ${
                  unsavedChanges
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                💾 {isSaving ? 'Saving...' : 'Save Progress'}
              </button>
            </div>
            <div
              ref={trackedRef}
              contentEditable={!isApplyingChangeRef.current}
              dangerouslySetInnerHTML={{ __html: trackedHtmlState }}
              className="p-3 bg-white border border-[#ddd] rounded whitespace-pre-wrap text-sm max-h-[40vh] overflow-y-auto"
              style={{ whiteSpace: 'pre-wrap' }}
            />
            {saveError && <p className="text-red-600 text-sm mt-1">{saveError}</p>}

            <div className="mt-4">
              <h3 className="text-sm text-[#555] font-medium mb-2">Clean Text</h3>
              <div className="p-3 bg-white border border-[#ddd] rounded whitespace-pre-wrap text-sm max-h-[40vh] overflow-y-auto">
                {editedText || 'No content'}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        del { background-color: #ffe6e6; text-decoration: line-through; margin: 0 2px; display: inline; }
        ins { background-color: #e6ffe6; text-decoration: none; margin: 0 2px; display: inline; }
        .change-group { position: relative; display: inline-block; white-space: nowrap; }
        .change-action {
          position: absolute; top: -22px; left: 0; background: white; border: 1px solid #ddd;
          border-radius: 4px; padding: 2px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); z-index: 100;
          gap: 4px; display: none; flex-direction: row; align-items: center;
        }
        .change-group:hover .change-action { display: flex !important; }
        .change-action button {
          padding: 2px 6px; font-size: 12px; border: 1px solid #ccc; border-radius: 3px;
          background: white; cursor: pointer;
        }
        .change-action button:hover { background: #f0f0f0; }
        .change-action button.accept-change { color: green; }
        .change-action button.reject-change { color: red; }
      `}</style>
    </div>
  );
}