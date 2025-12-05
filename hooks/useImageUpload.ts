// app/hooks/useImageUpload.ts
'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type UploadResult = {
  publicUrl: string;
  filePath: string;
};

export type UseImageUploadOptions = {
  bucket?: string;
  pathPrefix?: string;
};

export function useImageUpload({
  bucket = 'blog-images',
  pathPrefix = 'blog',
}: UseImageUploadOptions = {}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<UploadResult | null> => {
      if (!file?.type?.startsWith('image/')) {
        setError('File must be an image');
        return null;
      }

      setUploading(true);
      setError(null);

      try {
        // ✅ CORRECT: Get session properly
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;

        if (!userId) {
          throw new Error('User not authenticated');
        }

        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${pathPrefix}/${userId}/${Date.now()}_${safeFileName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
        return { publicUrl: urlData.publicUrl, filePath };
      } catch (err: unknown) {
        // ✅ Better error typing
        const message = err instanceof Error ? err.message : 'Upload failed';
        setError(message);
        return null;
      } finally {
        setUploading(false);
      }
    },
    [bucket, pathPrefix] // ✅ These are stable strings, safe to include
  );

  return {
    upload,
    uploading,
    error,
    clearError: () => setError(null),
  };
}