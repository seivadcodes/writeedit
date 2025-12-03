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

  // Fetch documents on mount
  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/documents');
      if (!res.ok) throw new Error('Failed to load documents');
      const { documents: docs } = await res.json();
      setDocuments(docs);
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

  // Save new document
  const saveDocument = useCallback(async () => {
    const {
      inputText,
      editedText,
      editLevel,
      selectedModel,
      customInstruction,
      documentId,
    } = editor;

    if (!inputText.trim() || !editedText.trim()) {
      setError('No valid content to save');
      return;
    }

    // Generate name from first sentence
    let name = inputText.substring(0, 50).replace(/\s+/g, ' ').trim();
    if (inputText.length > 50) name += '...';

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          originalText: inputText,
          editedText,
          level: editLevel,
          model: selectedModel,
          customInstruction,
        }),
      });

      if (!res.ok) throw new Error('Failed to save document');
      const { id } = await res.json();

      // Set as current document
      editor.setDocumentId(id);

      await fetchDocuments();
    } catch (err: any) {
      setError(err.message);
      console.error('Save failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [editor, fetchDocuments]);

  // Save progress to existing document
  const saveProgress = useCallback(async () => {
    if (!editor.documentId) {
      setError('No document loaded to update');
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
          originalText: editor.inputText,
          editedText: editor.editedText,
        }),
      });

      if (!res.ok) throw new Error('Failed to update document');
      await fetchDocuments(); // refresh timestamp
    } catch (err: any) {
      setError(err.message);
      console.error('Update failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [editor, fetchDocuments]);

  // Delete document
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

  // Load document into editor
  const loadDocument = useCallback((doc: SavedDocument) => {
    editor.loadDocument(doc.id, {
      originalText: doc.original_text,
      editedText: doc.edited_text,
      level: doc.level,
      model: doc.model,
      customInstruction: doc.custom_instruction,
    });
  }, [editor]);

  // Auto-save every 2 seconds if document is loaded
  useEffect(() => {
    if (!editor.documentId || !editor.inputText.trim() || !editor.editedText.trim()) return;

    const timer = setTimeout(() => {
      saveProgress();
    }, 2000);

    return () => clearTimeout(timer);
  }, [editor.documentId, editor.inputText, editor.editedText, saveProgress]);

  return {
    documents,
    isLoading,
    error,
    saveDocument,
    saveProgress,
    deleteDocument,
    loadDocument,
    fetchDocuments,
  };
}