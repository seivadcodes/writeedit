// /hooks/useDocument.ts
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useEditor } from './useEditor';

export interface SavedDocument {
  id: string;
  name: string;
  original_text: string;
  edited_text: string;
  level: string;
  model: string;
  custom_instruction: string;
  created_at: string;
  updated_at?: string;
}

export function useDocument() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editor = useEditor();

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/documents');
      if (!res.ok) throw new Error('Failed to load documents');
      const { documents: docs } = await res.json();
      setDocuments(docs || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Failed to fetch documents:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // ✅ Updated: accept optional `name`
  const saveDocument = useCallback(async (
    finalText: string,
    originalText: string,
    name?: string
  ) => {
    if (!originalText.trim() || !finalText.trim()) {
      setError('Both original and edited text are required.');
      return;
    }

    // ✅ Use provided name, or auto-generate
    const docName = name?.trim() ||
      originalText.substring(0, 50).replace(/\s+/g, ' ').trim() + 
      (originalText.length > 50 ? '...' : '');

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: docName,
          originalText: originalText.trim(),
          editedText: finalText.trim(),
          level: editor.editLevel,
          model: editor.selectedModel,
          customInstruction: editor.customInstruction,
        }),
      });

      if (!res.ok) throw new Error('Failed to save document');
      const { id } = await res.json();

      editor.setDocumentId(id);
      await fetchDocuments();
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error('Save failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [editor, fetchDocuments]);

  const saveProgress = useCallback(async (finalText: string, originalText: string) => {
    if (!editor.documentId) {
      setError('No document loaded to update');
      return;
    }
    if (!originalText.trim() || !finalText.trim()) {
      setError('Both original and edited text are required.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/documents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editor.documentId,
          originalText: originalText.trim(),
          editedText: finalText.trim(),
        }),
      });

      if (!res.ok) throw new Error('Failed to update document');
      await fetchDocuments();
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error('Update failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [editor, fetchDocuments]);

  const deleteDocument = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete document');
      await fetchDocuments();
      if (editor.documentId === id) {
        editor.reset();
        editor.setDocumentId(null);
      }
    } catch (err: any) {
      setError(err.message);
      console.error('Delete failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [editor, fetchDocuments]);

  // ✅ Enhanced loadDocument
  const loadDocument = useCallback((doc: SavedDocument) => {
    // Load core data into editor
    editor.loadDocument(doc.id, {
      originalText: doc.original_text,
      editedText: doc.edited_text,
      level: doc.level,
      model: doc.model,
      customInstruction: doc.custom_instruction,
    });

    // ✅ Switch to 'tracked' view — ensure useEditor exposes setViewMode
    if (typeof editor.setViewMode === 'function') {
      editor.setViewMode('tracked');
    }

    // ✅ Optional: trigger re-render if needed (depends on implementation)
    // If setInputText forces diff recalculation:
    if (typeof editor.setInputText === 'function') {
      editor.setInputText(doc.original_text);
    }
  }, [editor]);

  return {
    documents,
    isLoading,
    error,
    saveDocument,       // ✅ now accepts optional name
    saveProgress,
    deleteDocument,
    loadDocument,       // ✅ now switches to tracked view
    fetchDocuments,
  };
}