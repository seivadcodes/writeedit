// app/test-upload/page.tsx
"use client";

import { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { uploadImage } from '@/lib/uploadImage';

export default function TestUploadPage() {
  const [isLoggedIn] = useState(true); // toggle to false to hide upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (file: File) => {
    uploadImage({
      file,
      entityType: 'test-page',
      entityId: '1',
    })
      .then(() => alert('✅ Upload succeeded!'))
      .catch((err) => alert('❌ Upload failed: ' + err.message));
  };

  const handleImageClick = () => {
    if (isLoggedIn) {
      fileInputRef.current?.click();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isLoggedIn) return;
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith('image/')) {
      handleUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-12">
      <h1 className="text-3xl font-bold mb-8">🧪 Upload Test Page</h1>
      <p className="text-gray-400 mb-6">
        {isLoggedIn ? '✅ Logged in – upload enabled' : '❌ Not logged in – upload hidden'}
      </p>

      {/* Uploadable image */}
      <div
        className="relative w-80 h-60 mx-auto bg-gray-800 rounded-xl flex items-center justify-center"
        onClick={handleImageClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <span className="text-gray-500">Drag or click to upload</span>

        {isLoggedIn && (
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <Upload className="w-6 h-6 text-white" />
          </div>
        )}
      </div>

      {/* Hidden file input */}
      {isLoggedIn && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
      )}

      <div className="mt-8 text-center text-gray-500">
        This upload will be saved to:
        <br />
        • Bucket: <code className="bg-gray-800 px-2 rounded">test-uploads</code>
        <br />
        • Table: <code className="bg-gray-800 px-2 rounded">test_uploads</code>
        <br />
        • entityType: <code>test-page</code>, entityId: <code>1</code>
      </div>
    </div>
  );
}