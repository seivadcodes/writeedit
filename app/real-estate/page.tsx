// app/test-image/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Define our 5 real estate listings
const LISTINGS = [
  { id: 'luxury-villa', title: 'Luxury Villa' },
  { id: 'modern-penthouse', title: 'Modern Penthouse' },
  { id: 'beachfront-condo', title: 'Beachfront Condo' },
  { id: 'golf-mansion', title: 'Golf Mansion' },
  { id: 'test-property', title: 'Test Property Listing' }, // Original
];

export default function TestImagePage() {
  const [listings, setListings] = useState<{ [key: string]: string | null }>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Fetch user session and existing images for all listings
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      setUserId(uid || null);

      if (uid) {
        // Fetch all listings for this user
        const { data, error } = await supabase
          .from('blog_posts')
          .select('title, image_url')
          .eq('user_id', uid)
          .in('title', LISTINGS.map(l => l.title));

        if (error) {
          console.error('Failed to fetch listings:', error);
        } else {
          const previews: { [key: string]: string | null } = {};
          LISTINGS.forEach(listing => {
            previews[listing.id] = null;
          });
          data.forEach(row => {
            const listing = LISTINGS.find(l => l.title === row.title);
            if (listing) {
              previews[listing.id] = row.image_url || null;
            }
          });
          setListings(previews);
        }
      }
    };

    init();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, listingId: string) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setUploading(listingId);
    setStatus(null);

    try {
      const listing = LISTINGS.find(l => l.id === listingId);
      if (!listing) throw new Error('Invalid listing ID');

      const filePath = `blog/${userId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('blog-images')
        .upload(filePath, file, { upsert: false });

      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from('blog-images').getPublicUrl(filePath);
      const imageUrl = data.publicUrl;

      // Delete any existing post with this title
      await supabase
        .from('blog_posts')
        .delete()
        .eq('user_id', userId)
        .eq('title', listing.title);

      // Insert new post
      const { error: insertErr } = await supabase
        .from('blog_posts')
        .insert({
          user_id: userId,
          title: listing.title,
          content: `This is a ${listing.title} listing.`,
          image_url: imageUrl,
          published: false,
        });

      if (insertErr) throw insertErr;

      // Update local state
      setListings(prev => ({ ...prev, [listingId]: imageUrl }));
      setStatus(`✅ ${listing.title} image uploaded!`);
      e.target.value = '';
    } catch (err: any) {
      console.error(err);
      setStatus(`❌ Error: ${err.message}`);
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
      {LISTINGS.map((listing) => (
        <div
          key={listing.id}
          className="border rounded-lg overflow-hidden shadow-md bg-white"
        >
          {/* Header */}
          <div className="bg-gray-800 text-white p-4 flex justify-between items-center">
            <h2 className="text-xl font-bold">{listing.title}</h2>
            <button className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.09-4.5-4.688-4.5H5.688C3.09 3.75 1 5.765 1 8.25v12c0 2.485 2.09 4.5 4.688 4.5h10.688c2.59 0 4.688-2.015 4.688-4.5V8.25zM12 15.75l-3-3 3-3 3 3-3 3z" />
              </svg>
            </button>
          </div>

          {/* Image Preview */}
          <div className="p-4">
            {listings[listing.id] ? (
              <img
                src={listings[listing.id]!}
                alt={listing.title}
                className="w-full h-48 object-cover rounded border mb-3"
              />
            ) : (
              <div className="w-full h-48 bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 mb-3">
                No image
              </div>
            )}

            {userId ? (
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleUpload(e, listing.id)}
                disabled={uploading === listing.id}
                className="w-full"
              />
            ) : (
              <p className="text-red-600">Login required</p>
            )}
          </div>
        </div>
      ))}

      {uploading && <p className="text-center mt-4">Uploading...</p>}
      {status && (
        <p className={`text-center mt-4 ${status.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
          {status}
        </p>
      )}

      <p className="text-sm text-gray-500 mt-6 col-span-full text-center">
        Each listing uses the same <code>blog_posts</code> table and <code>blog-images</code> bucket.
        Images are stored under your user ID with the listing’s title as identifier.
      </p>
    </div>
  );
}