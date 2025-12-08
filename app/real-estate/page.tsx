// app/real-estate/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Define listings: each has fixed title, type, location, and default specs
const LISTINGS = [
  { id: 'luxury-villa', title: 'Luxury Villa', price: 2500000, sqft: 4200, beds: 6, baths: 8, location: 'Malibu, California', type: 'Villa' },
  { id: 'modern-penthouse', title: 'Modern Penthouse', price: 1800000, sqft: 2800, beds: 3, baths: 3, location: 'Manhattan, New York', type: 'Penthouse' },
  { id: 'beachfront-condo', title: 'Beachfront Condo', price: 950000, sqft: 1600, beds: 2, baths: 2, location: 'Miami Beach, Florida', type: 'Condo' },
  { id: 'golf-mansion', title: 'Golf Mansion', price: 3200000, sqft: 5600, beds: 7, baths: 6, location: 'Scottsdale, Arizona', type: 'Mansion' },
  { id: 'cozy-townhouse', title: 'Cozy Townhouse', price: 625000, sqft: 1400, beds: 3, baths: 2, location: 'Brooklyn, New York', type: 'Townhouse' },
];

export default function RealEstatePage() {
  const [listings, setListings] = useState<{ [key: string]: ListingData }>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  type ListingData = {
    image_url: string | null;
    price: number;
    sqft: number;
    beds: number;
    baths: number;
    location: string;
    type: string;
  };

  // Initialize: fetch user + existing listing data
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      setUserId(uid || null);

      if (uid) {
        const { data, error } = await supabase
          .from('blog_posts')
          .select('title, image_url, content')
          .eq('user_id', uid)
          .in('title', LISTINGS.map(l => l.title));

        if (error) {
          console.error('Failed to fetch listings:', error);
        } else {
          const initialState: { [key: string]: ListingData } = {};
          LISTINGS.forEach((l) => {
            const stored = data.find((row: any) => row.title === l.title);
            if (stored) {
              let price = l.price;
              let sqft = l.sqft;
              let beds = l.beds;
              let baths = l.baths;
              let location = l.location;
              let type = l.type;
              try {
                const content = JSON.parse(stored.content);
                price = content.price ?? price;
                sqft = content.sqft ?? sqft;
                beds = content.beds ?? beds;
                baths = content.baths ?? baths;
                location = content.location ?? location;
                type = content.type ?? type;
              } catch (e) {
                // fallback to defaults
              }
              initialState[l.id] = {
                image_url: stored.image_url || null,
                price,
                sqft,
                beds,
                baths,
                location,
                type,
              };
            } else {
              initialState[l.id] = {
                image_url: null,
                price: l.price,
                sqft: l.sqft,
                beds: l.beds,
                baths: l.baths,
                location: l.location,
                type: l.type,
              };
            }
          });
          setListings(initialState);
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
      if (!listing) throw new Error('Invalid listing');

      const filePath = `blog/${userId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('blog-images')
        .upload(filePath, file, { upsert: false });

      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from('blog-images').getPublicUrl(filePath);
      const imageUrl = data.publicUrl;

      // Save structured content as JSON
      const content = JSON.stringify({
        price: listings[listingId]?.price || listing.price,
        sqft: listings[listingId]?.sqft || listing.sqft,
        beds: listings[listingId]?.beds || listing.beds,
        baths: listings[listingId]?.baths || listing.baths,
        location: listings[listingId]?.location || listing.location,
        type: listings[listingId]?.type || listing.type,
        description: `Beautiful ${listing.title} property.`
      });

      // Upsert: delete old + insert new
      await supabase
        .from('blog_posts')
        .delete()
        .eq('user_id', userId)
        .eq('title', listing.title);

      const { error: insertErr } = await supabase
        .from('blog_posts')
        .insert({
          user_id: userId,
          title: listing.title,
          content,
          image_url: imageUrl,
          published: false,
        });

      if (insertErr) throw insertErr;

      setListings(prev => ({
        ...prev,
        [listingId]: {
          ...prev[listingId],
          image_url: imageUrl,
        },
      }));

      setStatus(`✅ ${listing.title} image updated!`);
      e.target.value = '';
    } catch (err: any) {
      console.error(err);
      setStatus(`❌ Error: ${err.message}`);
    } finally {
      setUploading(null);
    }
  };

  // Format price like $1.8M or $625K
  const formatPrice = (price: number): string => {
    if (price >= 1_000_000) {
      return `$${(price / 1_000_000).toFixed(1)}M`;
    } else if (price >= 1_000) {
      return `$${(price / 1_000).toFixed(0)}K`;
    }
    return `$${price.toLocaleString()}`;
  };

  // Color mapping for property types
  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'villa': return 'bg-purple-600';
      case 'penthouse': return 'bg-blue-600';
      case 'condo': return 'bg-indigo-600';
      case 'mansion': return 'bg-orange-500';
      case 'townhouse': return 'bg-green-600';
      default: return 'bg-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ===== HEADER ===== */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-8">
              <h1 className="text-2xl font-bold text-indigo-600">LuxEstate</h1>
              <nav className="hidden md:flex space-x-6">
                <a href="#" className="text-gray-700 hover:text-indigo-600 font-medium">Home</a>
                <a href="#" className="text-gray-700 hover:text-indigo-600 font-medium">Properties</a>
                <a href="#" className="text-gray-700 hover:text-indigo-600 font-medium">Agents</a>
                <a href="#" className="text-gray-700 hover:text-indigo-600 font-medium">About</a>
                <a href="#" className="text-gray-700 hover:text-indigo-600 font-medium">Contact</a>
              </nav>
            </div>
            <button className="bg-indigo-600 text-white px-4 py-2 rounded-full font-medium hover:bg-indigo-700 transition">
              List Property
            </button>
          </div>
        </div>
      </header>

      {/* ===== LISTINGS GRID ===== */}
      <div className="max-w-7xl mx-auto p-4 md:p-6 mt-6 space-y-10">
        <h2 className="text-2xl font-bold text-gray-800">Featured Properties</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {LISTINGS.map((listing) => {
            const data = listings[listing.id];
            const bgColorClass = getTypeColor(data?.type || listing.type);

            return (
              <div
                key={listing.id}
                className="rounded-xl overflow-hidden shadow-lg border border-gray-200 bg-white"
              >
                {/* Image Header */}
                <div className="relative h-48">
                  {data?.image_url ? (
                    <img
                      src={data.image_url}
                      alt={listing.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-r from-gray-200 to-gray-300 flex items-center justify-center text-gray-500">
                      No Image
                    </div>
                  )}
                  {/* Heart Icon */}
                  <button className="absolute top-3 right-3 bg-white/80 rounded-full p-2 hover:bg-white transition">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.682l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>
                </div>

                {/* Content Body */}
                <div className="p-4">
                  {/* Type Badge */}
                  <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold text-white mb-2 ${bgColorClass}`}>
                    {data?.type || listing.type}
                  </div>

                  {/* Title & Location — FIXED: no data?.title */}
                  <h3 className="font-bold text-lg text-gray-900">{listing.title}</h3>
                  <div className="flex items-center text-sm text-gray-500 mt-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.995 1.995 0 01-2.828 0l-4.244-4.244a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{data?.location || listing.location}</span>
                  </div>

                  {/* Price */}
                  <div className="mt-2 text-xl font-bold text-blue-600">
                    {formatPrice(data?.price || listing.price)}
                  </div>

                  {/* Stats */}
                  <div className="flex justify-between items-center mt-3 text-sm text-gray-600">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v6m3-3a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>{data?.beds || listing.beds} beds</span>
                      </div>
                      <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-2m-2 0h-2m-2 0h-2m-2 0h-2" />
                        </svg>
                        <span>{data?.baths || listing.baths} baths</span>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                      <span>{data?.sqft || listing.sqft} sqft</span>
                    </div>
                  </div>

                  {/* Upload Button */}
                  {userId ? (
                    <div className="mt-4">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUpload(e, listing.id)}
                        disabled={uploading === listing.id}
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                      />
                    </div>
                  ) : (
                    <p className="text-red-600 text-xs mt-2">Login to upload image</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status Toast */}
      {status && (
        <div className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg text-center z-50 ${
          status.startsWith('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {status}
        </div>
      )}

      <p className="text-xs text-gray-500 text-center mt-8 pb-6">
        All data stored in <code>blog_posts</code> (image_url + JSON in content) and <code>blog-images</code> bucket.
      </p>
    </div>
  );
}