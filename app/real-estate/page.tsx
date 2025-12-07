// app/real-estate/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Type for a property listing
type Property = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  image_url: string;
  created_at: string;
};

export default function RealEstatePage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Fetch user session and all property listings on mount
  useEffect(() => {
    const fetchProperties = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      setUserId(uid || null);

      if (uid) {
        const { data, error } = await supabase
          .from('blog_posts')
          .select('*')
          .eq('user_id', uid)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Failed to fetch properties:', error);
        } else {
          setProperties(data as Property[]);
        }
      }
    };

    fetchProperties();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setUploading(true);
    setStatus(null);

    try {
      const filePath = `blog/${userId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('blog-images')
        .upload(filePath, file, { upsert: false });

      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from('blog-images').getPublicUrl(filePath);
      const imageUrl = data.publicUrl;

      // Get metadata with safe fallbacks
      const titleInput = prompt('Enter property name (e.g., "Oceanview Mansion"):', 'Luxury Property');
      const priceInput = prompt('Enter price (e.g., 1500000):', '0');
      const sqftInput = prompt('Enter square footage:', '0');
      const propertyTypeInput = prompt('Enter type (e.g., Mansion, Condo):', 'House');

      // Ensure strings (never null)
      const title = (titleInput || 'Untitled Property').trim() || 'Untitled Property';
      const price = parseFloat(priceInput || '0') || 0;
      const sqft = parseInt(sqftInput || '0', 10) || 0;
      const property_type = (propertyTypeInput || 'House').trim() || 'House';

      const metadata = JSON.stringify({ price, sqft, property_type });

      const { error: insertErr } = await supabase
        .from('blog_posts')
        .insert({
          user_id: userId,
          title: title,            // ✅ now guaranteed string
          content: metadata,       // ✅ now guaranteed string
          image_url: imageUrl,
          published: true,
        });

      if (insertErr) throw insertErr;

      // Re-fetch properties
      const { data: newData, error: fetchErr } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (fetchErr) {
        console.error('Refetch error:', fetchErr);
      } else {
        setProperties(newData as Property[]);
      }

      setStatus('✅ Property added!');
      e.target.value = '';
    } catch (err: any) {
      console.error(err);
      setStatus(`❌ Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const getPropertyDetails = (content: string) => {
    try {
      return JSON.parse(content);
    } catch {
      return { price: 0, sqft: 0, property_type: 'Property' };
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="relative h-96 bg-gradient-to-r from-blue-900 to-indigo-700 flex items-center justify-center text-white">
        <div className="absolute inset-0 bg-black opacity-40"></div>
        <div className="relative z-10 text-center px-4">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">Luxury Real Estate</h1>
          <p className="text-xl max-w-2xl mx-auto">
            Discover your dream home — elegant, spacious, and perfectly located.
          </p>
        </div>
      </div>

      {/* Upload & Status */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {userId ? (
          <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              disabled={uploading}
              className="w-full sm:w-auto px-4 py-2 border rounded-md"
            />
            {uploading && <span className="text-blue-600">Uploading...</span>}
            {status && (
              <span className={status.startsWith('✅') ? 'text-green-600' : 'text-red-600'}>
                {status}
              </span>
            )}
          </div>
        ) : (
          <p className="text-red-600 mb-6">You must be logged in to add properties.</p>
        )}

        {/* Properties Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {properties.length === 0 ? (
            <p className="col-span-full text-center text-gray-500 py-10">
              No properties listed yet. Add one above!
            </p>
          ) : (
            properties.map((prop) => {
              const details = getPropertyDetails(prop.content);
              const formatter = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              });

              return (
                <div
                  key={prop.id}
                  className="bg-white rounded-xl shadow-lg overflow-hidden transform transition-transform hover:scale-105"
                >
                  <div className="h-56 overflow-hidden">
                    {prop.image_url ? (
                      <img
                        src={prop.image_url}
                        alt={prop.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                        <span className="text-gray-500">No image</span>
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <span className="inline-block bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded mb-2">
                      {details.property_type || 'Property'}
                    </span>
                    <h3 className="text-xl font-bold text-gray-800 mb-2">{prop.title}</h3>
                    <p className="text-gray-600 text-sm mb-3">
                      {details.sqft ? `${details.sqft.toLocaleString()} sqft` : 'Size not specified'}
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatter.format(details.price || 0)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}