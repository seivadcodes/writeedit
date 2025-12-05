// app/estate/page.tsx  (or pages/estate.tsx depending on your Next.js version)
import React, { useState, useRef } from 'react';
import { Upload } from 'lucide-react';
import { uploadImage } from '@/lib/uploadImage';

const EstatePage = () => {
  const [isLoggedIn] = useState(true); // 👈 toggle to false to hide upload UI
  const fileInputRef = useRef<HTMLInputElement>(null);

  const property = {
    id: '1',
    title: 'Oceanfront Infinity Estate',
    image: 'https://placehold.co/800x600/0c0a1d/ffffff?text=Oceanfront+Infinity',
  };

  const handleUpload = (file: File) => {
    uploadImage({
      file,
      entityType: 'estate', // or 'pageType' — your naming
      entityId: property.id,
    })
      .then(() => alert('✅ Upload successful!'))
      .catch((err) => alert('❌ ' + err.message));
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
    if (file && file.type.startsWith('image/')) {
      handleUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">{property.title}</h1>

      {/* Uploadable Image */}
      <div
        className="relative w-full max-w-2xl mx-auto group"
        onClick={handleImageClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <img
          src={property.image}
          alt={property.title}
          className="w-full rounded-xl shadow-2xl"
        />
        {isLoggedIn && (
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-black/60 backdrop-blur-sm rounded-full p-2">
              <Upload className="w-5 h-5 text-white" />
            </div>
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

      {!isLoggedIn && (
        <p className="text-center mt-4 text-gray-400">Log in to upload images.</p>
      )}
    </div>
  );
};

export default EstatePage;