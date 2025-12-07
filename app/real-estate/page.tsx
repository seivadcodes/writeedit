// app/test-image/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function TestImagePage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // 1. Get current user session on mount
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUserId(session?.user.id || null);
      
      // 2. Restore preview from sessionStorage if exists
      const savedPreview = sessionStorage.getItem('testImagePreview');
      if (savedPreview) {
        setPreview(savedPreview);
      }
    };
    
    getSession();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setUploading(true);
    setStatus(null);

    try {
      // 3. Use userId from state instead of refetching session
      const filePath = `blog/${userId}/${Date.now()}_${file.name}`;
      
      // 4. Fixed upload syntax and error handling
      const { error: uploadErr } = await supabase.storage
        .from('blog-images')
        .upload(filePath, file, { upsert: false });

      if (uploadErr) throw uploadErr;

      // 5. Fixed public URL retrieval
      const { data } = supabase.storage
        .from('blog-images')
        .getPublicUrl(filePath);
      
      const imageUrl = data.publicUrl;

      // 6. Save to database
      const { error: insertErr } = await supabase
        .from('blog_posts')
        .insert({
          user_id: userId,
          title: 'Test Image Upload',
          content: 'This is a test post for image upload.',
          image_url: imageUrl,
          published: false,
        });

      if (insertErr) throw insertErr;

      // 7. Persist preview in session storage
      setPreview(imageUrl);
      sessionStorage.setItem('testImagePreview', imageUrl);
      setStatus('✅ Uploaded and saved to blog_posts + blog-images!');
    } catch (err: any) {
      console.error(err);
      setStatus(`❌ Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // 8. Clear preview when user logs out
  useEffect(() => {
    if (!userId) {
      setPreview(null);
      sessionStorage.removeItem('testImagePreview');
    }
  }, [userId]);

  return (
    <div className="max-w-md mx-auto p-6 mt-10">
      <h1 className="text-2xl font-bold mb-4">ImageContext Test</h1>

      {preview ? (
        <img
          src={preview}
          alt="Uploaded"
          className="w-full h-48 object-contain border mb-4"
        />
      ) : (
        <div className="w-full h-48 bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 mb-4">
          No image uploaded
        </div>
      )}

      {/* 9. Disable input when no user or uploading */}
      <input
        type="file"
        accept="image/*"
        onChange={handleUpload}
        disabled={uploading || !userId}
        className="w-full mb-2"
      />
      {uploading && <p>Uploading...</p>}
      {status && <p className={status.startsWith('✅') ? 'text-green-600' : 'text-red-600'}>{status}</p>}
      
      <p className="text-sm text-gray-500 mt-4">
        This will create a test draft in your <code>blog_posts</code> table and upload to <code>blog-images</code>.
      </p>
    </div>
  );
}