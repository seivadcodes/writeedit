'use client';

import { useState, useEffect } from 'react';

const SAVED_DOCUMENTS_KEY = 'saved_documents';
const MAX_SAVED_DOCUMENTS = 10;

export type SavedDocument = {
  id: string;
  name: string;
  originalText: string;
  editedText: string;
  timestamp: number;
  level: string;
  model: string;
  customInstruction: string;
};

export function useSavedDocuments() {
  const [savedDocuments, setSavedDocuments] = useState<SavedDocument[]>([]);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_DOCUMENTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Sort by timestamp descending (newest first)
        parsed.sort((a: SavedDocument, b: SavedDocument) => b.timestamp - a.timestamp);
        setSavedDocuments(parsed.slice(0, MAX_SAVED_DOCUMENTS));
      }
    } catch (e) {
      console.error('Failed to load saved documents:', e);
      localStorage.setItem(SAVED_DOCUMENTS_KEY, JSON.stringify([]));
    }
  }, []);

  // Save full document (new)
  const saveDocument = ({
    name,
    originalText,
    editedText,
    level,
    model,
    customInstruction,
  }: {
    name: string;
    originalText: string;
    editedText: string;
    level: string;
    model: string;
    customInstruction: string;
  }) => {
    if (!originalText || !editedText) return null;

    const document: SavedDocument = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name,
      originalText,
      editedText,
      timestamp: Date.now(),
      level,
      model,
      customInstruction,
    };

    const updated = [document, ...savedDocuments].slice(0, MAX_SAVED_DOCUMENTS);
    setSavedDocuments(updated);
    setCurrentDocumentId(document.id);
    localStorage.setItem(SAVED_DOCUMENTS_KEY, JSON.stringify(updated));
    return document.id;
  };

  // Save progress to current document
  const saveProgressToCurrentDocument = ({
    originalText,
    editedText,
  }: {
    originalText: string;
    editedText: string;
  }) => {
    if (!currentDocumentId || !originalText || !editedText) return false;

    setSavedDocuments((prev) => {
      const updated = prev.map((doc) =>
        doc.id === currentDocumentId
          ? { ...doc, originalText, editedText, timestamp: Date.now() }
          : doc
      );
      
      // Sort by timestamp descending
      updated.sort((a, b) => b.timestamp - a.timestamp);
      
      localStorage.setItem(SAVED_DOCUMENTS_KEY, JSON.stringify(updated));
      return updated;
    });
    return true;
  };

  // Auto-save (call from editor debounce)
  const autoSaveProgress = ({
    originalText,
    editedText,
  }: {
    originalText: string;
    editedText: string;
  }) => {
    if (!currentDocumentId || !originalText || !editedText) return;
    
    try {
      const updated = savedDocuments.map((doc) =>
        doc.id === currentDocumentId
          ? { ...doc, originalText, editedText, timestamp: Date.now() }
          : doc
      );
      
      // Sort by timestamp descending
      updated.sort((a, b) => b.timestamp - a.timestamp);
      
      localStorage.setItem(SAVED_DOCUMENTS_KEY, JSON.stringify(updated));
      setSavedDocuments(updated);
    } catch (e) {
      console.warn('Auto-save failed:', e);
    }
  };

  const setCurrentDocument = (id: string | null) => {
    setCurrentDocumentId(id);
  };

  const deleteDocument = (id: string) => {
    const updated = savedDocuments.filter((doc) => doc.id !== id);
    setSavedDocuments(updated);
    if (currentDocumentId === id) setCurrentDocumentId(null);
    localStorage.setItem(SAVED_DOCUMENTS_KEY, JSON.stringify(updated));
  };

  return {
    savedDocuments,
    currentDocumentId,
    saveDocument,
    saveProgressToCurrentDocument,
    autoSaveProgress,
    setCurrentDocument,
    deleteDocument,
  };
}