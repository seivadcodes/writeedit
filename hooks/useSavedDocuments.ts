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

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_DOCUMENTS_KEY);
      if (saved) {
        setSavedDocuments(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load saved documents:', e);
    }
  }, []);

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
      localStorage.setItem(SAVED_DOCUMENTS_KEY, JSON.stringify(updated));
      return updated;
    });
    return true;
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
    setCurrentDocument: setCurrentDocumentId, // Fixed naming here
    deleteDocument,
  };
}