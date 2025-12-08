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

type ListingData = {
  image_url: string | null;
  price: number;
  sqft: number;
  beds: number;
  baths: number;
  location: string;
  type: string;
};

export default function RealEstatePage() {
  const [listings, setListings] = useState<{ [key: string]: ListingData }>({});
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [heroUploading, setHeroUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [adminMode, setAdminMode] = useState(true); // Default to ON for logged-in users

  // Initialize: fetch user + existing listing data + hero image
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      setUserId(uid || null);

      if (uid) {
        // Fetch listings data
        const { data: listingsData, error: listingsError } = await supabase
          .from('blog_posts')
          .select('title, image_url, content')
          .eq('user_id', uid)
          .in('title', LISTINGS.map(l => l.title));

        if (listingsError) {
          console.error('Failed to fetch listings:', listingsError);
        } else {
          const initialState: { [key: string]: ListingData } = {};
          LISTINGS.forEach((l) => {
            const stored = listingsData.find((row: any) => row.title === l.title);
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

        // Fetch hero image
        const { data: heroData, error: heroError } = await supabase
          .from('blog_posts')
          .select('image_url')
          .eq('user_id', uid)
          .eq('title', 'hero_image')
          .single();

        if (!heroError || heroError.code === 'PGRST116') { // PGRST116 = no rows found
          if (heroData) {
            setHeroImageUrl(heroData.image_url);
          }
        } else {
          console.error('Failed to fetch hero image:', heroError);
        }
      }
    };

    init();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, listingId: string) => {
    if (!adminMode) return;
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

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!adminMode) return;
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setHeroUploading(true);
    setStatus(null);

    try {
      const filePath = `blog/${userId}/hero_${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('blog-images')
        .upload(filePath, file, { upsert: false });

      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from('blog-images').getPublicUrl(filePath);
      const imageUrl = data.publicUrl;

      // Delete existing hero record
      await supabase
        .from('blog_posts')
        .delete()
        .eq('user_id', userId)
        .eq('title', 'hero_image');

      // Insert new hero record
      const { error: insertErr } = await supabase
        .from('blog_posts')
        .insert({
          user_id: userId,
          title: 'hero_image',
          content: JSON.stringify({ 
            tagline: 'Discover Your Dream Home', 
            description: 'Luxury properties in the world\'s most exclusive locations' 
          }),
          image_url: imageUrl,
          published: false,
        });

      if (insertErr) throw insertErr;

      setHeroImageUrl(imageUrl);
      setStatus('✅ Hero image updated!');
      e.target.value = '';
    } catch (err: any) {
      console.error(err);
      setStatus(`❌ Error: ${err.message}`);
    } finally {
      setHeroUploading(false);
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
      <header className="bg-white shadow-sm border-b z-10 relative">
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

      {/* ===== HERO SECTION ===== */}
      <div className="relative h-[60vh] min-h-[400px] max-h-[600px] w-full overflow-hidden">
        {/* Background Image with Overlay */}
        {heroImageUrl ? (
          <img
            src={heroImageUrl}
            alt="Luxury properties background"
            className="w-full h-full object-cover brightness-75 transition-all duration-500 hover:brightness-90"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-indigo-900 via-purple-800 to-pink-700">
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          </div>
        )}
        
        {/* Content Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 md:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg">
              Discover Your Dream Home
            </h1>
            <p className="text-xl md:text-2xl text-white/90 mb-8 drop-shadow-md">
              Luxury properties in the world's most exclusive locations
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button className="bg-white text-indigo-700 font-bold px-6 py-3 rounded-full hover:bg-indigo-50 hover:shadow-lg transition transform hover:-translate-y-0.5">
                Explore Properties
              </button>
              <button className="bg-transparent border-2 border-white text-white font-bold px-6 py-3 rounded-full hover:bg-white/10 hover:shadow-lg transition">
                Schedule a Tour
              </button>
            </div>
          </div>
        </div>

        {/* Hero Upload Button (Admin Only) */}
        {userId && adminMode && (
          <div className="absolute top-6 right-6 z-20">
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleHeroUpload}
                disabled={heroUploading}
                className="hidden"
                id="hero-upload"
              />
              <label
                htmlFor="hero-upload"
                className={`cursor-pointer ${heroUploading ? 'opacity-70' : 'hover:opacity-90'}`}
                title={heroUploading ? "Uploading..." : "Change hero image"}
              >
                <div className="flex items-center bg-black/50 text-white px-4 py-2 rounded-full backdrop-blur-sm border border-white/20 hover:border-white/40 transition">
                  {heroUploading ? (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className="font-medium">
                    {heroUploading ? 'Uploading...' : 'Change Hero Image'}
                  </span>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Tiny Admin Toggle (only if logged in) */}
        {userId && (
          <div className="absolute top-6 left-6 z-20">
            <button
              onClick={() => setAdminMode(!adminMode)}
              className={`text-xs px-2 py-1 rounded-full font-mono ${
                adminMode
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-500 text-white'
              }`}
              title={adminMode ? 'Disable admin mode' : 'Enable admin mode'}
            >
              {adminMode ? 'ADMIN ON' : 'ADMIN OFF'}
            </button>
          </div>
        )}
        
        {/* Decorative Elements */}
        <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

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
                className="rounded-xl overflow-hidden shadow-lg border border-gray-200 bg-white hover:shadow-xl transition-shadow duration-300"
              >
                {/* Image Header */}
                <div className="relative h-48">
                  {data?.image_url ? (
                    <img
                      src={data.image_url}
                      alt={listing.title}
                      className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-r from-gray-200 to-gray-300 flex items-center justify-center text-gray-500">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  {/* Heart Icon */}
                  <button className="absolute top-3 right-3 bg-white/80 rounded-full p-2 hover:bg-white transition shadow-md">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.682l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>
                </div>

                <div className="p-4">
                  <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold text-white mb-2 ${bgColorClass}`}>
                    {data?.type || listing.type}
                  </div>
                  <h3 className="font-bold text-lg text-gray-900">{listing.title}</h3>
                  <div className="flex items-center text-sm text-gray-500 mt-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.995 1.995 0 01-2.828 0l-4.244-4.244a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{data?.location || listing.location}</span>
                  </div>
                  <div className="mt-2 text-xl font-bold text-blue-600">
                    {formatPrice(data?.price || listing.price)}
                  </div>
                  <div className="flex justify-between items-center mt-3 text-sm text-gray-600">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v6m3-3a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>{data?.beds || listing.beds} beds</span>
                      </div>
                      <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-2m-2 0h-2m-2 0h-2m-2 0h-2" />
                        </svg>
                        <span>{data?.baths || listing.baths} baths</span>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                      <span>{data?.sqft || listing.sqft} sqft</span>
                    </div>
                  </div>

                  {/* Admin Upload Input */}
                  {userId && adminMode && (
                    <div className="mt-4">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUpload(e, listing.id)}
                        disabled={uploading === listing.id}
                        className="w-full text-xs border border-gray-300 rounded px-2 py-1 file:mr-4 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== WHY CLIENTS CHOOSE US ===== */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-16 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl my-12">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Why Top Agents Trust LuxEstate Tech
          </h2>
          <p className="text-lg text-gray-700">
            We don’t just build websites—we build lead-generating, brand-elevating digital experiences that close high-value deals.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              title: "Stunning Visual Storytelling",
              desc: "High-res imagery, immersive galleries, and cinematic hero sections that make properties irresistible.",
              icon: "📸"
            },
            {
              title: "Real-Time Property Management",
              desc: "Agents update listings, prices, and photos instantly—no developer needed. Built-in admin controls save hours weekly.",
              icon: "⚡"
            },
            {
              title: "Built for Luxury Conversions",
              desc: "Strategic CTAs, seamless tour scheduling, and lead capture forms designed to turn browsers into buyers.",
              icon: "💼"
            }
          ].map((item, idx) => (
            <div key={idx} className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition">
              <div className="text-4xl mb-4">{item.icon}</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h3>
              <p className="text-gray-600">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <button className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold px-8 py-4 rounded-full text-lg hover:shadow-xl transition transform hover:-translate-y-1">
            Get Your Custom Luxury Site →
          </button>
          <p className="text-gray-600 mt-4 text-sm">
            Fully managed. White-glove service. Ready in 14 days.
          </p>
        </div>
      </div>

      {/* ===== FOOTER ===== */}
      <footer className="bg-gray-900 text-white mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div>
              <h3 className="text-xl font-bold text-indigo-400 mb-4">LuxEstate</h3>
              <p className="text-gray-400 text-sm">
                Curating the world’s most exclusive properties for discerning clients.
              </p>
              <div className="flex space-x-4 mt-4">
                {['twitter', 'instagram', 'linkedin', 'facebook'].map((platform) => (
                  <a key={platform} href="#" className="text-gray-400 hover:text-white transition" aria-label={platform}>
                    <span className="sr-only">{platform}</span>
                    {/* Replace with real icons in production (e.g., react-icons) */}
                    <div className="h-5 w-5 bg-gray-700 rounded-full flex items-center justify-center text-xs">
                      {platform[0].toUpperCase()}
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold mb-4">Explore</h4>
              <ul className="space-y-2 text-gray-400">
                {['Featured Listings', 'New Developments', 'Luxury Rentals', 'Investment Opportunities'].map((item) => (
                  <li key={item}>
                    <a href="#" className="hover:text-white transition">{item}</a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400">
                {['Buying Guide', 'Selling Tips', 'Market Reports', 'Neighborhood Insights'].map((item) => (
                  <li key={item}>
                    <a href="#" className="hover:text-white transition">{item}</a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold mb-4">Contact Us</h4>
              <address className="text-gray-400 not-italic text-sm space-y-2">
                <p>123 Prestige Avenue</p>
                <p>Beverly Hills, CA 90210</p>
                <p className="mt-2">info@luxestate.example</p>
                <p>+1 (555) 123-4567</p>
              </address>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-10 pt-6 text-center text-gray-500 text-sm">
            © {new Date().getFullYear()} LuxEstate. All rights reserved. | Crafted for elite real estate visionaries.
          </div>
        </div>
      </footer>

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