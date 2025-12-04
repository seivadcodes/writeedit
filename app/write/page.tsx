// app/write/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// --- Supabase ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function getCurrentUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id || null;
}

// --- Types ---
interface DraftListItem {
  id: string;
  title: string;
  updated_at?: string;
  lastEdited?: string;
}

interface FullDraft {
  id: string;
  title: string;
  content: string;
  updated_at?: string;
}

interface HistoryState {
  content: string;
  title: string;
  selection: SelectionState | null;
  timestamp: number;
}

interface SelectionState {
  startOffset: number;
  endOffset: number;
  startContainerPath: ElementPathStep[];
  endContainerPath: ElementPathStep[];
}

interface ElementPathStep {
  nodeType: number;
  nodeName: string;
  index: number;
}

const HISTORY_OPTIONS = {
  MAX_STATES: 100,
  THROTTLE_DELAY: 300,
};

// --- Escape HTML (for rendering in JSX strings) ---
const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// --- Time formatting ---
const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  return date.toLocaleDateString();
};

const generateId = (): string => 'local_' + Math.random().toString(36).substring(2, 11);

// --- Main Component ---
export default function WritePage() {
  // --- Refs ---
  const canvasRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingHistoryCaptureRef = useRef<NodeJS.Timeout | null>(null);
  const currentSelectionRangeRef = useRef<Range | null>(null);

  // --- State ---
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isAiOperation, setIsAiOperation] = useState(false);
  const [isApplyingHistory, setIsApplyingHistory] = useState(false);
  const [historyStack, setHistoryStack] = useState<HistoryState[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [lastHistoryTimestamp, setLastHistoryTimestamp] = useState(0);
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [autosaveStatus, setAutosaveStatus] = useState('Start writing to create a draft');
  const [autosaveStatusType, setAutosaveStatusType] = useState<'saved' | 'saving' | 'error' | 'unsaved' | 'info'>('info');
  const [wordCount, setWordCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // --- Toast ---
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const updateAutosaveStatus = (text: string, type: typeof autosaveStatusType) => {
    setAutosaveStatus(text);
    setAutosaveStatusType(type);
  };

  // --- Selection utils ---
  const saveCurrentSelection = () => {
    if (!canvasRef.current) return;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (canvasRef.current.contains(range.commonAncestorContainer)) {
        currentSelectionRangeRef.current = range.cloneRange();
      }
    }
  };

  const restoreSavedSelection = (): boolean => {
    const range = currentSelectionRangeRef.current;
    if (!range || !canvasRef.current) return false;
    try {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return true;
    } catch {
      currentSelectionRangeRef.current = null;
      return false;
    }
  };

  const getElementPath = (element: Node, root: Node): ElementPathStep[] => {
    if (element === root) return [];
    const path: ElementPathStep[] = [];
    let current: Node | null = element;
    while (current && current !== root) {
      if (current.parentNode) {
        let index = 0;
        let sibling = current.previousSibling;
        while (sibling) {
          if (sibling.nodeType === current.nodeType && sibling.nodeName === current.nodeName) index++;
          sibling = sibling.previousSibling;
        }
        path.unshift({
          nodeType: current.nodeType,
          nodeName: current.nodeName,
          index,
        });
        current = current.parentNode;
      } else break;
    }
    return path;
  };

  const resolveElementPath = (path: ElementPathStep[], root: Node): Node | null => {
    if (path.length === 0) return root;
    let current: Node = root;
    for (const step of path) {
      if (current.nodeType !== 1) return null;
      let found: Node | null = null;
      let count = 0;
      for (let i = 0; i < current.childNodes.length; i++) {
        const child = current.childNodes[i];
        if (child.nodeType === step.nodeType && child.nodeName === step.nodeName) {
          if (count === step.index) {
            found = child;
            break;
          }
          count++;
        }
      }
      if (!found) return null;
      current = found;
    }
    return current;
  };

  const saveSelectionState = (): SelectionState | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!canvas.contains(range.startContainer)) return null;
    return {
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      startContainerPath: getElementPath(range.startContainer, canvas),
      endContainerPath: getElementPath(range.endContainer, canvas),
    };
  };

  const restoreSelectionState = (state: SelectionState | null) => {
    if (!state || !canvasRef.current) return;
    const startContainer = resolveElementPath(state.startContainerPath, canvasRef.current);
    const endContainer =
      state.startContainerPath === state.endContainerPath
        ? startContainer
        : resolveElementPath(state.endContainerPath, canvasRef.current);
    if (!startContainer || !endContainer) return;
    try {
      const range = document.createRange();
      range.setStart(startContainer, state.startOffset);
      range.setEnd(endContainer, state.endOffset);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      currentSelectionRangeRef.current = range.cloneRange();
    } catch (e) {
      console.warn('Selection restore failed', e);
    }
  };

  // --- History ---
  const resetHistory = () => {
    setHistoryStack([]);
    setCurrentHistoryIndex(-1);
    setLastHistoryTimestamp(0);
    if (pendingHistoryCaptureRef.current) {
      clearTimeout(pendingHistoryCaptureRef.current);
      pendingHistoryCaptureRef.current = null;
    }
  };

  const shouldCaptureHistory = () => !isApplyingHistory && !isAiOperation;

  const captureHistoryState = () => {
    if (!shouldCaptureHistory()) return;
    const now = Date.now();
    if (now - lastHistoryTimestamp < HISTORY_OPTIONS.THROTTLE_DELAY) {
      if (pendingHistoryCaptureRef.current) clearTimeout(pendingHistoryCaptureRef.current);
      pendingHistoryCaptureRef.current = setTimeout(captureHistoryState, HISTORY_OPTIONS.THROTTLE_DELAY);
      return;
    }

    const canvas = canvasRef.current;
    const titleEl = titleRef.current;
    if (!canvas || !titleEl) return;

    const content = canvas.textContent || '';
    const title = titleEl.value || 'Untitled Draft';
    const selection = saveSelectionState();

    const lastState = historyStack[currentHistoryIndex];
    if (lastState && lastState.content === content && lastState.title === title) return;

    let newStack = historyStack.slice(0, currentHistoryIndex + 1);
    const newState: HistoryState = { content, title, selection, timestamp: now };
    newStack.push(newState);
    if (newStack.length > HISTORY_OPTIONS.MAX_STATES) {
      newStack = newStack.slice(1);
      setCurrentHistoryIndex(prev => prev - 1);
    }

    setHistoryStack(newStack);
    setCurrentHistoryIndex(newStack.length - 1);
    setLastHistoryTimestamp(now);
    if (pendingHistoryCaptureRef.current) {
      clearTimeout(pendingHistoryCaptureRef.current);
      pendingHistoryCaptureRef.current = null;
    }
  };

  const applyHistoryState = (state: HistoryState) => {
    if (!canvasRef.current || !titleRef.current) return;
    canvasRef.current.textContent = state.content;
    titleRef.current.value = state.title;
    restoreSelectionState(state.selection);
    updateWordCount();
    updateAutosaveStatus('History restored', 'info');
  };

  const undo = () => {
    if (currentHistoryIndex <= 0 || historyStack.length === 0) {
      showToast('No more undo history', 'info');
      return;
    }
    setIsApplyingHistory(true);
    setCurrentHistoryIndex(prev => prev - 1);
    applyHistoryState(historyStack[currentHistoryIndex - 1]);
    setIsApplyingHistory(false);
    showToast('Changes undone', 'success');
  };

  const redo = () => {
    if (currentHistoryIndex >= historyStack.length - 1) {
      showToast('No more redo history', 'info');
      return;
    }
    setIsApplyingHistory(true);
    setCurrentHistoryIndex(prev => prev + 1);
    applyHistoryState(historyStack[currentHistoryIndex + 1]);
    setIsApplyingHistory(false);
    showToast('Changes redone', 'success');
  };

  // --- Word count ---
  const updateWordCount = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const text = canvas.textContent || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount(words);
  };

  // --- Local storage ---
  const getLocalDrafts = (): FullDraft[] => {
    const stored = localStorage.getItem('localDrafts');
    return stored ? JSON.parse(stored) : [];
  };

  const saveToLocalDrafts = (draft: FullDraft) => {
    const drafts = getLocalDrafts();
    const index = drafts.findIndex((d) => d.id === draft.id);
    if (index > -1) drafts[index] = draft;
    else drafts.push(draft);
    localStorage.setItem('localDrafts', JSON.stringify(drafts));
  };

  // --- Supabase draft persistence ---
  const saveDraftToSupabase = async (content: string, title: string): Promise<string> => {
    const userId = await getCurrentUserId();
    if (!userId) {
      const id = currentDraftId || generateId();
      saveToLocalDrafts({ id, title, content, updated_at: new Date().toISOString() });
      showToast('Saved locally. Log in to sync.', 'info');
      return id;
    }

    const now = new Date().toISOString();
    const trimmedContent = content.trim();
    if (currentDraftId) {
      const { error } = await supabase
        .from('drafts')
        .update({ title, content: trimmedContent, updated_at: now })
        .eq('id', currentDraftId)
        .eq('user_id', userId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from('drafts')
        .insert([{ user_id: userId, title, content: trimmedContent }])
        .select('id')
        .single();
      if (error) throw error;
      if (!data) throw new Error('Failed to create draft');
      setCurrentDraftId(data.id);
      return data.id;
    }
    setIsDirty(false);
    return currentDraftId!;
  };

  const loadDraft = async (id: string) => {
    resetHistory();
    setIsApplyingHistory(true);
    setCurrentDraftId(id);
    currentSelectionRangeRef.current = null;

    const userId = await getCurrentUserId();
    let data: FullDraft | undefined = undefined;

    if (userId) {
      const { data: dbData, error } = await supabase
        .from('drafts')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !dbData) {
        showToast('Failed to load draft', 'error');
        setIsApplyingHistory(false);
        return;
      }
      data = {
        id: dbData.id,
        title: dbData.title,
        content: dbData.content,
        updated_at: dbData.updated_at,
      };
    } else {
      const drafts = getLocalDrafts();
      data = drafts.find((d) => d.id === id);
      if (!data) {
        showToast('Draft not found locally', 'error');
        setIsApplyingHistory(false);
        return;
      }
    }

    if (canvasRef.current) canvasRef.current.textContent = data.content || '';
    if (titleRef.current) titleRef.current.value = data.title;
    setIsDirty(false);
    updateWordCount();
    updateAutosaveStatus('Draft loaded', 'saved');
    captureHistoryState();
    setIsApplyingHistory(false);
  };

  const loadAllDrafts = async () => {
    const userId = await getCurrentUserId();
    let drafts: DraftListItem[] = [];
    if (userId) {
      const { data } = await supabase
        .from('drafts')
        .select('id, title, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      drafts = (data || []).map(d => ({
        id: d.id,
        title: d.title,
        updated_at: d.updated_at,
      }));
    } else {
      drafts = getLocalDrafts().map(d => ({
        id: d.id,
        title: d.title,
        updated_at: d.updated_at,
      }));
    }
    setDrafts(
      drafts.map((d) => ({
        ...d,
        lastEdited: d.updated_at ? formatTimeAgo(new Date(d.updated_at)) : 'Just now',
      }))
    );
  };

  // --- Save logic ---
  const manuallySave = async () => {
    const canvas = canvasRef.current;
    const titleEl = titleRef.current;
    if (!canvas || !titleEl) return;

    const content = canvas.textContent || '';
    const title = titleEl.value || 'Untitled Draft';

    if (!currentDraftId) {
      try {
        const id = await saveDraftToSupabase(content, title);
        setCurrentDraftId(id);
        showToast('New draft saved', 'success');
        captureHistoryState();
      } catch (err) {
        console.error('Create draft failed:', err);
        showToast('Failed to create draft', 'error');
        updateAutosaveStatus('Save failed', 'error');
      }
    } else {
      setIsDirty(true);
      const userId = await getCurrentUserId();
      if (!userId) {
        saveToLocalDrafts({ id: currentDraftId, title, content, updated_at: new Date().toISOString() });
        updateAutosaveStatus('Saved locally', 'saved');
        showToast('Saved locally. Log in to sync.', 'info');
      } else {
        updateAutosaveStatus('Saving…', 'saving');
        try {
          await saveDraftToSupabase(content, title);
          updateAutosaveStatus('All changes saved', 'saved');
          showToast('Saved to cloud', 'success');
        } catch (err) {
          console.error('Manual save failed:', err);
          updateAutosaveStatus('Save failed', 'error');
        }
      }
    }
  };

  const autosave = async () => {
    if (!isDirty || !currentDraftId) return;
    const canvas = canvasRef.current;
    const titleEl = titleRef.current;
    if (!canvas || !titleEl) return;

    const content = canvas.textContent || '';
    const title = titleEl.value || 'Untitled Draft';

    const userId = await getCurrentUserId();
    if (!userId) {
      saveToLocalDrafts({ id: currentDraftId, title, content, updated_at: new Date().toISOString() });
      updateAutosaveStatus('Saved locally', 'saved');
      return;
    }

    updateAutosaveStatus('Saving…', 'saving');
    try {
      await saveDraftToSupabase(content, title);
      updateAutosaveStatus('All changes saved', 'saved');
    } catch (err) {
      console.error('Autosave failed:', err);
      updateAutosaveStatus('Save failed – retrying', 'error');
      setTimeout(() => {
        if (isDirty) autosave();
      }, 3000);
    }
  };

  // --- Input handler ---
  const handleInput = () => {
    setIsDirty(true);
    updateWordCount();
    currentSelectionRangeRef.current = null;

    if (currentDraftId) {
      updateAutosaveStatus('Unsaved changes', 'unsaved');
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(autosave, 2000);
      captureHistoryState();
    } else {
      updateAutosaveStatus('Creating draft…', 'saving');
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(manuallySave, 500);
    }
  };

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        manuallySave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, currentDraftId]);

  // --- Initial load ---
  useEffect(() => {
    loadAllDrafts();
    resetHistory();
    captureHistoryState();
    updateWordCount();

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (pendingHistoryCaptureRef.current) clearTimeout(pendingHistoryCaptureRef.current);
    };
  }, []);

  // --- AI Functions (simplified – only Spark shown fully) ---
  const callAiApi = async (body: any): Promise<any> => {
    const res = await fetch('/api/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'AI request failed');
    }
    return await res.json();
  };

  const handleGenerateSpark = async () => {
    if (!canvasRef.current || !titleRef.current) return;
    captureHistoryState();
    setIsAiOperation(true);
    const title = titleRef.current.value.trim() || 'Untitled';
    const isEmpty = !(canvasRef.current.textContent?.trim());
    const prompt = isEmpty
      ? `Write ONLY ONE vivid, engaging sentence to start a piece titled "${title}". No quotes, no markdown, no extra text.`
      : `Write ONLY ONE natural next sentence to continue this piece titled "${title}". Do not summarize or conclude. Just one sentence. No quotes, no markdown.`;

    try {
      updateAutosaveStatus('✨ Generating spark...', 'saving');
      const data = await callAiApi({
        instruction: prompt,
        model: 'x-ai/grok-4.1-fast:free',
        editLevel: 'generate',
      });
      let text = data.generatedPost?.content || data.generatedPost || data.editedText || '';
      const firstSentenceMatch = text.trim().match(/^[^.!?]*[.!?]/);
      let sentence = firstSentenceMatch
        ? firstSentenceMatch[0]
        : (text.split('\n')[0] || 'A new beginning.').trim();
      if (!sentence.endsWith('.') && !sentence.endsWith('!') && !sentence.endsWith('?')) sentence += '.';

      setIsApplyingHistory(true);
      if (isEmpty) {
        if (canvasRef.current) canvasRef.current.textContent = sentence + ' ';
      } else {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.collapse(false);
          range.insertNode(document.createTextNode(' ' + sentence + ' '));
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      setIsApplyingHistory(false);
      captureHistoryState();
      setIsDirty(true);
      updateWordCount();
      updateAutosaveStatus('Spark inserted!', 'saved');
      showToast('✨ One-sentence spark added!', 'success');
    } catch (err) {
      console.error('Spark failed:', err);
      showToast('AI spark failed – try again', 'error');
      updateAutosaveStatus('Spark failed', 'error');
    } finally {
      setIsAiOperation(false);
      currentSelectionRangeRef.current = null;
    }
  };

  // --- Render UI ---
  return (
    <div className="writing-app">
      <style jsx global>{`
        .writing-app {
          display: flex;
          height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Spectral', serif;
          background: #f9f9f9;
          flex-direction: column;
        }
        .drafts-sidebar {
          display: none;
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: white;
          z-index: 1000;
          flex-direction: column;
        }
        .drafts-sidebar.active {
          display: flex;
        }
        .sidebar-header {
          padding: 16px;
          border-bottom: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .sidebar-header h3 {
          margin: 0;
          font-size: 1em;
          color: #333;
        }
        #close-sidebar-btn {
          background: none;
          border: none;
          font-size: 1.4em;
          padding: 4px 8px;
          cursor: pointer;
          color: #888;
        }
        .drafts-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
        }
        .draft-item {
          padding: 12px 16px;
          cursor: pointer;
          border-bottom: 1px solid #f5f5f5;
          font-size: 0.95em;
          color: #333;
        }
        .draft-item:hover {
          background: #f0f7ff;
        }
        .draft-item.active {
          background: #e3f2fd;
          font-weight: 600;
        }
        .writing-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .writing-header {
          padding: 12px 16px;
          border-bottom: 1px solid #eee;
          background: white;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        #draft-title {
          font-size: 1.25em;
          font-weight: 600;
          border: none;
          outline: none;
          font-family: inherit;
          color: #222;
          padding: 8px 0;
          width: 100%;
        }
        .mobile-drafts-toggle {
          background: #f0f0f0;
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 0.9em;
          color: #444;
          cursor: pointer;
          align-self: flex-start;
          font-weight: 500;
        }
        .ai-controls-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ai-btn {
          padding: 8px 12px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9em;
          color: #333;
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 1;
          min-width: 90px;
          text-align: center;
        }
        .ai-btn:hover {
          background: #f8f9fa;
        }
        .header-actions {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: space-between;
          width: 100%;
        }
        .history-controls {
          display: flex;
          gap: 8px;
        }
        .history-btn {
          padding: 6px 12px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1em;
          min-width: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .autosave-status {
          color: #666;
          font-size: 0.85em;
          white-space: nowrap;
        }
        .autosave-saved { color: #2e7d32; }
        .autosave-saving { color: #1976d2; }
        .autosave-error { color: #d32f2f; }
        .autosave-unsaved { color: #ed6c02; }
        .writing-canvas {
          flex: 1;
          padding: 24px 16px;
          font-size: 1.1em;
          line-height: 1.6;
          outline: none;
          white-space: pre-wrap;
          word-wrap: break-word;
          color: #111;
          caret-color: #1976d2;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        .writing-canvas:focus { outline: none; }
        .writing-canvas:empty::before {
          content: attr(data-placeholder);
          color: #aaa;
          pointer-events: none;
          font-style: italic;
        }
        .writing-footer {
          padding: 10px 16px;
          border-top: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          color: #666;
          font-size: 0.85em;
          background: white;
        }
        .btn {
          padding: 6px 12px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9em;
          color: #333;
        }
        .btn-primary {
          background: #1976d2;
          color: white;
          border: none;
        }
        .btn-primary:hover {
          background: #1565c0;
        }
        @media (min-width: 769px) {
          .writing-app {
            flex-direction: row;
          }
          .mobile-drafts-toggle {
            display: none;
          }
          .drafts-sidebar {
            display: flex;
            position: static;
            width: 240px;
            border-right: 1px solid #eee;
          }
          .writing-header {
            flex-direction: row;
            padding: 16px 24px;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
          }
          #draft-title {
            font-size: 1.4em;
            min-width: 200px;
            flex: 1;
          }
          .writing-canvas {
            padding: 60px 40px;
            max-width: 720px;
            margin: 0 auto;
          }
          .header-actions {
            justify-content: flex-end;
          }
        }
      `}</style>

      {/* Sidebar */}
      <div className={`drafts-sidebar ${sidebarOpen ? 'active' : ''}`}>
        <div className="sidebar-header">
          <h3>Your Drafts</h3>
          <button
            className="btn btn-primary"
            onClick={() => {
              resetHistory();
              if (canvasRef.current) canvasRef.current.textContent = '';
              if (titleRef.current) titleRef.current.value = 'Untitled Draft';
              setCurrentDraftId(null);
              setIsDirty(false);
              currentSelectionRangeRef.current = null;
              captureHistoryState();
              updateWordCount();
              updateAutosaveStatus('New draft ready – start typing!', 'info');
              if (window.innerWidth <= 768) setSidebarOpen(false);
            }}
          >
            📄 New
          </button>
          <button className="btn" id="close-sidebar-btn" onClick={() => setSidebarOpen(false)}>
            ×
          </button>
        </div>
        <div className="drafts-list">
          {drafts.length > 0 ? (
            drafts.map((d) => (
              <div
                key={d.id}
                className={`draft-item ${d.id === currentDraftId ? 'active' : ''}`}
                onClick={() => {
                  loadDraft(d.id);
                  if (window.innerWidth <= 768) setSidebarOpen(false);
                }}
              >
                <span className="draft-title">{escapeHtml(d.title)}</span>
                <span className="draft-time">{d.lastEdited}</span>
              </div>
            ))
          ) : (
            <div style={{ padding: '16px', color: '#888' }}>No drafts yet</div>
          )}
        </div>
      </div>

      {/* Main Writing Area */}
      <div className="writing-main">
        <div className="writing-header">
          <input
            type="text"
            ref={titleRef}
            placeholder="Untitled Draft"
            className="draft-title-input"
            defaultValue="Untitled Draft"
            id="draft-title"
          />
          <button className="mobile-drafts-toggle" onClick={() => setSidebarOpen(true)}>
            Drafts
          </button>
          <div className="ai-controls-group">
            <div className="ai-controls-top">
              <button className="btn ai-btn" onClick={handleGenerateSpark}>
                ✨ Spark
              </button>
              {/* Add other AI buttons similarly */}
            </div>
          </div>
          <div className="header-actions">
            <div className="history-controls">
              <button className="btn history-btn" onClick={undo} title="Undo (Ctrl+Z)">
                ↩️
              </button>
              <button className="btn history-btn" onClick={redo} title="Redo (Ctrl+Y)">
                ↪️
              </button>
            </div>
            <span className={`autosave-status autosave-${autosaveStatusType}`}>{autosaveStatus}</span>
            <button
              className="btn"
              onClick={async () => {
                if (!currentDraftId) {
                  showToast('Save your draft first', 'info');
                  return;
                }
                const userId = await getCurrentUserId();
                if (!userId) {
                  showToast('Log in to save versions', 'info');
                  return;
                }
                const content = canvasRef.current?.textContent || '';
                const { error } = await supabase.from('versions').insert({ draft_id: currentDraftId, content });
                if (error) showToast('Version failed', 'error');
                else showToast('Version saved', 'success');
              }}
            >
              💾 Version
            </button>
          </div>
        </div>
        <div
          ref={canvasRef}
          contentEditable
          className="writing-canvas"
          data-placeholder="Start writing your masterpiece…"
          onInput={handleInput}
          onSelect={saveCurrentSelection}
          onTouchEnd={saveCurrentSelection}
          onMouseUp={saveCurrentSelection}
        ></div>
        <div className="writing-footer">
          <span>{wordCount} words</span>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            padding: '12px 20px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: 500,
            backgroundColor:
              toast.type === 'success'
                ? '#4caf50'
                : toast.type === 'error'
                ? '#f44336'
                : '#2196f3',
            zIndex: 1001,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}