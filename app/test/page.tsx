// app/test/page.tsx — DEBUG VERSION
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, getCurrentUserId } from '@/lib/supabase';

export default function TestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const router = useRouter();

  // 🔍 DEBUG: Log everything to console
  useEffect(() => {
    const debugInit = async () => {
      console.group('🚀 UPLOAD PAGE INIT');
      
      // Step 1: Get session
      const { data: { session } } = await supabase.auth.getSession();
      console.log('🔒 Session:', session);
      
      if (!session) {
        console.warn('❌ No session found. Redirecting to login.');
        router.push('/auth/signin');
        setLoadingAuth(false);
        console.groupEnd();
        return;
      }

      const userId = session.user.id;
      const userEmail = session.user.email;

      console.log('👤 User ID:', userId);
      console.log('📧 User Email:', userEmail);

      setUser({ id: userId, email: userEmail });
      setLoadingAuth(false);

      console.groupEnd();
    };

    debugInit();
  }, [router]);

  if (loadingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>🔍 Debugging auth... check console</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsUploading(true);

    console.group('📤 UPLOAD STARTED');
    console.time('Total Upload Time');

    try {
      // ✅ VALIDATION
      if (!file) {
        throw new Error('No file selected');
      }
      if (!text.trim()) {
        throw new Error('Text content is empty');
      }
      if (file.size > 50 * 1024 * 1024) {
        throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
      }

      console.log('✅ Validation passed');
      console.log('📄 Text:', text.substring(0, 30) + '...');
      console.log('🖼️ File:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2), 'MB');

      // 📁 GENERATE FILE PATH
      const fileName = `${user.id}/${Date.now()}-${file.name}`;
      console.log('📁 Generated file path:', fileName);

      // 🖼️ UPLOAD TO STORAGE
      console.time('Storage Upload');
      const { error: uploadError } = await supabase
        .storage
        .from('user-uploads')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('🚨 Storage Upload Failed:', uploadError);
        throw new Error(`Storage failed: ${uploadError.message}`);
      }
      console.timeEnd('Storage Upload');
      console.log('✅ Image uploaded successfully');

      // 💾 INSERT INTO DATABASE
      console.time('Database Insert');
      console.log('📥 Inserting into posts table with user_id:', user.id);
      
      const { error: dbError } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          content: text.trim(),
          image_path: fileName,
        });

      if (dbError) {
        console.error('🚨 Database Insert Failed:', dbError);
        
        // 👇 THIS IS THE KEY — LOG THE EXACT ERROR FROM SUPABASE
        console.log('💥 RLS POLICY VIOLATION DETECTED');
        console.log('❗️ Supabase returned this error message:');
        console.log(dbError.message); // 👈 THIS TELLS YOU WHAT'S WRONG

        // 👇 ALSO LOG THE RAW RESPONSE IF POSSIBLE
        if ((dbError as any).status === 403) {
          console.log('🚫 Forbidden: Likely RLS policy violation');
        }

        throw new Error(`Database insert failed: ${dbError.message}`);
      }
      console.timeEnd('Database Insert');
      console.log('✅ Post saved successfully');

      alert('🎉 Upload successful!');
      setFile(null);
      setText('');

    } catch (err: any) {
      console.error('💥 CRITICAL ERROR:', err);
      setError(err.message || 'Upload failed. Check console for details.');
    } finally {
      console.timeEnd('Total Upload Time');
      console.groupEnd();
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">🛠️ DEBUG UPLOAD PAGE</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
          ❌ {error}
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
          {isUploading ? '⏳ Uploading...' : '📤 Upload'}
        </button>
      </form>

      {/* 💡 DEBUG INFO */}
      <div className="mt-8 p-4 bg-gray-50 rounded-md">
        <h3 className="font-bold mb-2">🔍 Debug Info:</h3>
        <p><strong>User ID:</strong> {user?.id || 'Not logged in'}</p>
        <p><strong>Email:</strong> {user?.email || 'N/A'}</p>
        <p><strong>Session Valid:</strong> {user ? '✅ Yes' : '❌ No'}</p>
      </div>
    </div>
  );
}