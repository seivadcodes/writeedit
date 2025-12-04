// app/test/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, getCurrentUserId } from '@/lib/supabase';

export default function TestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const router = useRouter();

  // 🔐 Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const userId = await getCurrentUserId();
      if (!userId) {
        router.push('/auth/signin');
      } else {
        setUser({ id: userId });
      }
      setLoadingAuth(false);
    };
    checkAuth();
  }, [router]);

  // Show loading while checking auth
  if (loadingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading...</p>
      </div>
    );
  }

  // Should not happen if redirect works, but safe guard
  if (!user) {
    return null;
  }

  // 📤 Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsUploading(true);

    // Validation
    if (!file) {
      setError('Please select an image');
      setIsUploading(false);
      return;
    }

    if (!text.trim()) {
      setError('Please enter some text');
      setIsUploading(false);
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError('File too large. Maximum size is 50MB.');
      setIsUploading(false);
      return;
    }

    try {
      // 📁 Generate unique file path: user-id/timestamp-filename
      const fileName = `${user.id}/${Date.now()}-${file.name}`;

      // 🖼️ Upload image to Supabase Storage
      const { error: uploadError } = await supabase
        .storage
        .from('user-uploads')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(uploadError.message || 'Failed to upload image');
      }

      // 💾 Save metadata to posts table
      const { error: dbError } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,       // ✅ Matches auth.uid() thanks to RLS
          content: text.trim(),
          image_path: fileName,
        });

      if (dbError) {
        console.error('Database insert error:', dbError);
        throw new Error(dbError.message || 'Failed to save post');
      }

      // ✅ Success
      alert('Upload successful!');
      setFile(null);
      setText('');

    } catch (err: any) {
      const message = err.message || 'Upload failed. Please try again.';
      setError(message);
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Upload Image + Text</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Text Input */}
        <div>
          <label htmlFor="text" className="block mb-2 font-medium text-gray-700">
            Text Content
          </label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
            rows={4}
            placeholder="Write something about your image..."
            required
          />
        </div>

        {/* File Input */}
        <div>
          <label htmlFor="image" className="block mb-2 font-medium text-gray-700">
            Image Upload (max 50MB)
          </label>
          <input
            id="image"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full p-2 border border-gray-300 rounded-md"
            required
          />
          {file && (
            <p className="mt-1 text-sm text-gray-600">
              Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isUploading}
          className={`w-full py-3 px-4 rounded-md font-medium text-white transition ${
            isUploading
              ? 'bg-blue-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isUploading ? 'Uploading...' : 'Upload'}
        </button>
      </form>
    </div>
  );
}