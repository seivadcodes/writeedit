'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // Check authentication status (replace with your auth logic)
  const isAuthenticated = true; // TODO: Replace with actual auth check

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsUploading(true);

    if (!file) {
      setError('Please select an image');
      setIsUploading(false);
      return;
    }

    const formData = new FormData();
    formData.append('image', file);
    formData.append('text', text);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      alert('Upload successful!');
      setFile(null);
      setText('');
    } catch (err) {
      setError('Upload failed. Please try again.');
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Upload Content</h1>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="text" className="block mb-2 font-medium">
            Text Content
          </label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full p-2 border rounded"
            rows={4}
            required
          />
        </div>

        <div>
          <label htmlFor="image" className="block mb-2 font-medium">
            Image Upload
          </label>
          <input
            id="image"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full p-2 border rounded"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isUploading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isUploading ? 'Uploading...' : 'Upload'}
        </button>
      </form>
    </div>
  );
}