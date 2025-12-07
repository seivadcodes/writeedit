// app/properties/upload/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Represents one property slot
type PropertySlot = {
  id: number;
  file: File | null;
  previewUrl: string | null;
  uploading: boolean;
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error';
};

export default function PropertyUploadPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [slots, setSlots] = useState<PropertySlot[]>(
    Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      file: null,
      previewUrl: null,
      uploading: false,
      uploadStatus: 'idle',
    }))
  );

  // Fetch user on mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUserId(session?.user.id || null);
    };
    getUser();
  }, []);

  const handleFileChange = (slotId: number, file: File | null) => {
    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.id === slotId) {
          if (!file) {
            return { ...slot, file: null, previewUrl: null };
          }

          // Generate local preview
          const previewUrl = URL.createObjectURL(file);
          return { ...slot, file, previewUrl, uploadStatus: 'idle' };
        }
        return slot;
      })
    );
  };

  const handleUpload = async (slotId: number) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot?.file || !userId) return;

    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId ? { ...s, uploading: true, uploadStatus: 'uploading' } : s
      )
    );

    try {
      const filePath = `property-images/${userId}/${Date.now()}_${slot.file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('blog-images') // or rename bucket to 'property-images'
        .upload(filePath, slot.file, { upsert: false });

      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from('blog-images').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      // 👉 Optional: Save to a `properties` table later
      // For now, just keep the URL in state or show success

      setSlots((prev) =>
        prev.map((s) =>
          s.id === slotId
            ? {
                ...s,
                uploading: false,
                uploadStatus: 'success',
                previewUrl: publicUrl, // show uploaded image
              }
            : s
        )
      );

      // Revoke local preview to avoid memory leaks
      if (slot.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(slot.previewUrl);
      }
    } catch (err: any) {
      console.error('Upload failed:', err);
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slotId
            ? { ...s, uploading: false, uploadStatus: 'error' }
            : s
        )
      );
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>, slotId: number) => {
    const file = e.target.files?.[0] || null;
    if (file && file.type.startsWith('image/')) {
      handleFileChange(slotId, file);
    }
    e.target.value = ''; // reset input
  };

  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-red-600 text-lg">You must be logged in to upload property images.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 text-center mb-2">Add New Properties</h1>
        <p className="text-gray-600 text-center mb-10">
          Upload images for up to 4 properties. Click any slot to begin.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {slots.map((slot) => (
            <div
              key={slot.id}
              className="bg-white rounded-xl shadow-sm border-2 border-dashed border-gray-300 hover:border-emerald-400 transition-colors overflow-hidden relative"
            >
              {/* Property preview or placeholder */}
              {slot.previewUrl ? (
                <div className="relative">
                  <img
                    src={slot.previewUrl}
                    alt={`Property ${slot.id}`}
                    className="w-full h-48 object-cover"
                  />
                  {slot.uploadStatus === 'success' && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                      ✓ Saved
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-48 bg-gray-100 flex items-center justify-center">
                  <span className="text-gray-400 text-sm">Click to add image</span>
                </div>
              )}

              {/* Upload controls */}
              <div className="p-4">
                <label className="block w-full cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileInput(e, slot.id)}
                    className="hidden"
                  />
                  <span className="text-emerald-600 font-medium hover:underline">
                    {slot.file ? 'Change Image' : 'Select Image'}
                  </span>
                </label>

                {slot.file && slot.uploadStatus !== 'success' && (
                  <button
                    onClick={() => handleUpload(slot.id)}
                    disabled={slot.uploading}
                    className={`mt-2 w-full py-1.5 text-sm font-medium rounded ${
                      slot.uploading
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {slot.uploading ? 'Uploading...' : 'Upload to Cloud'}
                  </button>
                )}

                {slot.uploadStatus === 'error' && (
                  <p className="mt-2 text-red-600 text-xs">Upload failed. Try again.</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center text-gray-500 text-sm">
          Images are stored in <code>blog-images</code> bucket under your user ID.
        </div>
      </div>
    </div>
  );
}