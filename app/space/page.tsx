// app/space-exploration/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Mission data with default specs
const MISSIONS = [
  { id: 'mars-rover', title: 'Perseverance Rover', destination: 'Mars', status: 'Active', duration: '3+ years', crew: 'Autonomous' },
  { id: 'jwst', title: 'James Webb Telescope', destination: 'L2 Orbit', status: 'Operational', duration: '20+ years', crew: 'Uncrewed' },
  { id: 'iss', title: 'International Space Station', destination: 'Low Earth Orbit', status: 'Active', duration: '24/7', crew: '7 astronauts' },
  { id: 'voyager', title: 'Voyager 1', destination: 'Interstellar Space', status: 'Active', duration: '46+ years', crew: 'Uncrewed' },
  { id: 'artemis', title: 'Artemis Program', destination: 'Moon', status: 'In Development', duration: 'Long-term', crew: '4 astronauts' },
];

type MissionData = {
  image_url: string | null;
  status: string;
  duration: string;
  crew: string;
  destination: string;
};

export default function SpaceExplorationPage() {
  const [missions, setMissions] = useState<{ [key: string]: MissionData }>({});
  const [missionControlImage, setMissionControlImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [controlUploading, setControlUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [adminMode, setAdminMode] = useState(true);
  const [activeSection, setActiveSection] = useState('overview');
  const [orbitAngle, setOrbitAngle] = useState(0);
  const starfieldRef = useRef<HTMLDivElement>(null);

  // Initialize user and data
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      setUserId(uid || null);

      if (uid) {
        // Fetch mission data
        const { data: missionsData, error: missionsError } = await supabase
          .from('blog_posts')
          .select('title, image_url, content')
          .eq('user_id', uid)
          .in('title', MISSIONS.map(m => m.title));

        if (missionsError) {
          console.error('Failed to fetch missions:', missionsError);
        } else {
          const initialState: { [key: string]: MissionData } = {};
          MISSIONS.forEach((m) => {
            const stored = missionsData.find((row: any) => row.title === m.title);
            if (stored) {
              let status = m.status;
              let duration = m.duration;
              let crew = m.crew;
              let destination = m.destination;
              try {
                const content = JSON.parse(stored.content);
                status = content.status ?? status;
                duration = content.duration ?? duration;
                crew = content.crew ?? crew;
                destination = content.destination ?? destination;
              } catch (e) {
                // fallback to defaults
              }
              initialState[m.id] = {
                image_url: stored.image_url || null,
                status,
                duration,
                crew,
                destination,
              };
            } else {
              initialState[m.id] = {
                image_url: null,
                status: m.status,
                duration: m.duration,
                crew: m.crew,
                destination: m.destination,
              };
            }
          });
          setMissions(initialState);
        }

        // Fetch mission control image
        const { data: controlData, error: controlError } = await supabase
          .from('blog_posts')
          .select('image_url')
          .eq('user_id', uid)
          .eq('title', 'mission_control')
          .single();

        if (!controlError || controlError.code === 'PGRST116') {
          if (controlData) {
            setMissionControlImage(controlData.image_url);
          }
        } else {
          console.error('Failed to fetch mission control image:', controlError);
        }
      }
    };

    init();
  }, []);

  // Animation effects
  useEffect(() => {
    const handleScroll = () => {
      if (starfieldRef.current) {
        const scrollY = window.scrollY;
        starfieldRef.current.style.backgroundPosition = `center ${scrollY * 0.3}px`;
        setOrbitAngle(scrollY * 0.15);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, missionId: string) => {
    if (!adminMode) return;
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setUploading(missionId);
    setStatus(null);

    try {
      const mission = MISSIONS.find(m => m.id === missionId);
      if (!mission) throw new Error('Invalid mission');

      const filePath = `blog/${userId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('blog-images')
        .upload(filePath, file, { upsert: false });

      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from('blog-images').getPublicUrl(filePath);
      const imageUrl = data.publicUrl;

      const content = JSON.stringify({
        status: missions[missionId]?.status || mission.status,
        duration: missions[missionId]?.duration || mission.duration,
        crew: missions[missionId]?.crew || mission.crew,
        destination: missions[missionId]?.destination || mission.destination,
      });

      await supabase
        .from('blog_posts')
        .delete()
        .eq('user_id', userId)
        .eq('title', mission.title);

      const { error: insertErr } = await supabase
        .from('blog_posts')
        .insert({
          user_id: userId,
          title: mission.title,
          content,
          image_url: imageUrl,
          published: false,
        });

      if (insertErr) throw insertErr;

      setMissions(prev => ({
        ...prev,
        [missionId]: {
          ...prev[missionId],
          image_url: imageUrl,
        },
      }));

      setStatus(`✅ ${mission.title} visual updated!`);
      e.target.value = '';
    } catch (err: any) {
      console.error(err);
      setStatus(`❌ Error: ${err.message}`);
    } finally {
      setUploading(null);
    }
  };

  const handleControlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!adminMode) return;
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setControlUploading(true);
    setStatus(null);

    try {
      const filePath = `blog/${userId}/control_${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('blog-images')
        .upload(filePath, file, { upsert: false });

      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from('blog-images').getPublicUrl(filePath);
      const imageUrl = data.publicUrl;

      await supabase
        .from('blog_posts')
        .delete()
        .eq('user_id', userId)
        .eq('title', 'mission_control');

      const { error: insertErr } = await supabase
        .from('blog_posts')
        .insert({
          user_id: userId,
          title: 'mission_control',
          content: JSON.stringify({ 
            description: 'Mission Control Operations Center' 
          }),
          image_url: imageUrl,
          published: false,
        });

      if (insertErr) throw insertErr;

      setMissionControlImage(imageUrl);
      setStatus('✅ Mission Control visual updated!');
      e.target.value = '';
    } catch (err: any) {
      console.error(err);
      setStatus(`❌ Error: ${err.message}`);
    } finally {
      setControlUploading(false);
    }
  };

  // Mission status color coding
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'operational': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'in development': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      default: return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0e17] text-white overflow-x-hidden">
      {/* Animated starfield background */}
      <div 
        ref={starfieldRef}
        className="fixed inset-0 z-0 opacity-80"
        style={{
          backgroundImage: `
            radial-gradient(circle at 10% 20%, rgba(94, 238, 245, 0.1) 0%, transparent 20%),
            radial-gradient(circle at 90% 80%, rgba(147, 51, 234, 0.1) 0%, transparent 20%),
            radial-gradient(circle at 30% 70%, rgba(236, 72, 153, 0.08) 0%, transparent 25%)
          `,
          backgroundSize: '200% 200%',
          animation: 'gradientBG 15s ease infinite',
        }}
      >
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(white, transparent 70%)`,
            backgroundSize: '30px 30px',
            opacity: 0.3,
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent 70%)'
          }}
        />
      </div>
      
      {/* Orbital navigation ring */}
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] pointer-events-none z-10">
        <div 
          className="absolute border border-purple-500/20 rounded-full"
          style={{
            width: '100%',
            height: '100%',
            transform: `rotate(${orbitAngle}deg)`,
            boxShadow: '0 0 30px rgba(167, 139, 250, 0.2)'
          }}
        >
          {[...Array(12)].map((_, i) => (
            <div 
              key={i}
              className="absolute w-3 h-3 bg-purple-400 rounded-full opacity-60"
              style={{
                top: '50%',
                left: '0',
                transform: `rotate(${i * 30}deg) translateX(calc(50% - 1.5px)) translateY(-50%)`
              }}
            />
          ))}
        </div>
      </div>

      {/* Admin toggle - floating control panel */}
      {userId && (
        <div className="fixed bottom-8 left-8 z-50">
          <div className="bg-[#1a1f36]/90 backdrop-blur-sm border border-purple-500/20 rounded-xl p-4 shadow-xl">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              <span className="text-sm font-mono">SYSTEM ONLINE</span>
            </div>
            
            <div className="flex flex-col space-y-2">
              <button
                onClick={() => setAdminMode(!adminMode)}
                className={`px-4 py-2 rounded-lg font-mono text-sm transition-all ${
                  adminMode 
                    ? 'bg-purple-900/50 text-purple-300 border border-purple-500/30' 
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {adminMode ? 'SECURE MODE' : 'OPS MODE'}
              </button>
              
              <div className="mt-2 p-3 bg-black/30 rounded-lg border border-purple-500/20">
                <div className="flex items-center justify-between text-xs">
                  <span>USER ID:</span>
                  <code className="text-purple-400">{userId.slice(0, 8)}...</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mission Control section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-24">
        <div className="absolute inset-0 z-0">
          {missionControlImage ? (
            <div 
              className="absolute inset-0 bg-cover bg-center opacity-20 transition-opacity duration-500"
              style={{ 
                backgroundImage: `url(${missionControlImage})`,
                maskImage: 'linear-gradient(to bottom, transparent, black 70%)'
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 to-cyan-900/20" />
          )}
        </div>
        
        <div className="relative z-10 max-w-6xl mx-auto px-4 py-16 text-center">
          <div className="mb-12">
            <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/30 mb-6">
              <div className="w-2 h-2 rounded-full bg-purple-400 mr-2 animate-pulse"></div>
              <span className="text-purple-300 font-mono text-sm tracking-wide">MISSION CONTROL</span>
            </div>
            <h1 className="text-6xl md:text-8xl font-bold mb-6">
              <span className="bg-gradient-to-r from-cyan-300 to-purple-400 bg-clip-text text-transparent">SPACE EXPLORATION</span>
              <span className="block text-3xl md:text-5xl mt-2 text-gray-300">Humanity's Journey Beyond Earth</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Real-time monitoring of active missions across our solar system and beyond. 
              Data updated continuously from ground stations worldwide.
            </p>
          </div>
          
          <div className="flex justify-center space-x-6 mt-12">
            {['overview', 'current-missions', 'deep-space', 'crewed'].map((section) => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`px-6 py-3 rounded-full font-medium transition-all ${
                  activeSection === section
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {section.replace('-', ' ').toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Mission Control upload button */}
        {userId && adminMode && (
          <div className="absolute top-8 right-8 z-20">
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleControlUpload}
                disabled={controlUploading}
                className="hidden"
                id="control-upload"
              />
              <label
                htmlFor="control-upload"
                className={`cursor-pointer ${controlUploading ? 'opacity-70' : 'hover:opacity-90'}`}
                title={controlUploading ? "Uploading..." : "Update Mission Control visual"}
              >
                <div className="flex items-center bg-black/60 text-cyan-300 px-4 py-2 rounded-lg backdrop-blur-sm border border-cyan-500/30 hover:border-cyan-400 transition">
                  {controlUploading ? (
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className="font-mono text-sm">
                    {controlUploading ? 'UPDATING...' : 'UPDATE VISUAL'}
                  </span>
                </div>
              </label>
            </div>
          </div>
        )}
      </section>

      {/* Mission Status Grid */}
      <section className="relative py-24 bg-black/30 backdrop-blur-sm border-y border-purple-500/20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              ACTIVE MISSION STATUS
            </h2>
            <p className="text-gray-400 max-w-3xl mx-auto">
              Real-time telemetry from deep space missions. All data synchronized with NASA/ESA ground stations.
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {MISSIONS.map((mission) => {
              const data = missions[mission.id];
              return (
                <div 
                  key={mission.id}
                  className="group relative bg-black/40 backdrop-blur-sm rounded-2xl overflow-hidden border border-purple-500/20 hover:border-purple-500/40 transition-all duration-500"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 to-cyan-900/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="relative p-6 h-full flex flex-col">
                    <div className={`inline-flex items-center px-3 py-1 rounded-full mb-4 border ${getStatusColor(data?.status || mission.status)}`}>
                      <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: 'currentColor' }}></div>
                      <span className="font-mono text-xs">{data?.status || mission.status}</span>
                    </div>
                    
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold mb-2">{mission.title}</h3>
                      <p className="text-gray-400 mb-6">{data?.destination || mission.destination}</p>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-gray-500 mb-1 font-mono">DURATION</div>
                          <div className="text-cyan-300 font-medium">{data?.duration || mission.duration}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 mb-1 font-mono">CREW/TYPE</div>
                          <div className="text-cyan-300 font-medium">{data?.crew || mission.crew}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-6 space-y-3">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>LAST SIGNAL</span>
                        <span className="text-cyan-300">2m ago</span>
                      </div>
                      <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-cyan-500 to-purple-600" style={{ width: '87%' }}></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="absolute -right-4 -bottom-4 w-40 h-40 opacity-10">
                    <div 
                      className="w-full h-full rounded-full border-2"
                      style={{
                        borderColor: `conic-gradient(from ${orbitAngle}deg, #6366f1, #8b5cf6, #ec4899, #6366f1)`,
                        animation: 'pulse 8s linear infinite',
                        maskImage: 'radial-gradient(circle, white 50%, transparent 70%)'
                      }}
                    />
                  </div>
                  
                  {/* Admin upload overlay */}
                  {userId && adminMode && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-4">
                      <div className="text-center mb-4">
                        <div className="text-purple-400 mb-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <h4 className="text-lg font-bold mb-1">UPDATE VISUAL</h4>
                        <p className="text-gray-400 text-sm">Upload mission visualization</p>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUpload(e, mission.id)}
                        disabled={uploading === mission.id}
                        className="w-full text-xs file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-purple-900/30 file:text-purple-300 hover:file:bg-purple-900/50"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Deep Space Network */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0">
          <div 
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: `radial-gradient(circle at 20% 30%, rgba(79, 70, 229, 0.15) 0%, transparent 40%),
                                radial-gradient(circle at 80% 20%, rgba(124, 58, 237, 0.15) 0%, transparent 40%),
                                radial-gradient(circle at 50% 70%, rgba(168, 85, 247, 0.1) 0%, transparent 50%)`,
              animation: 'float 25s ease-in-out infinite'
            }}
          />
        </div>
        
        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 mb-6">
              <div className="w-2 h-2 rounded-full bg-cyan-400 mr-2 animate-pulse"></div>
              <span className="text-cyan-300 font-mono text-sm tracking-wide">DEEP SPACE NETWORK</span>
            </div>
            <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
              Interplanetary Communication Network
            </h2>
            <p className="text-gray-300 max-w-3xl mx-auto">
              Our global array of giant radio antennas provides constant communication with spacecraft across the solar system.
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              {[
                { 
                  title: 'Signal Strength', 
                  value: '89 dB', 
                  description: 'Average signal strength from Mars orbiters',
                  gradient: 'from-cyan-500 to-blue-600'
                },
                { 
                  title: 'Data Throughput', 
                  value: '4.2 TB/day', 
                  description: 'Daily data transmission from deep space missions',
                  gradient: 'from-purple-500 to-pink-600'
                },
                { 
                  title: 'Network Coverage', 
                  value: '360°', 
                  description: 'Continuous coverage through global antenna array',
                  gradient: 'from-amber-500 to-orange-600'
                }
              ].map((stat, idx) => (
                <div key={idx} className="p-5 bg-black/30 backdrop-blur-sm rounded-xl border border-gray-800">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-lg font-bold text-white">{stat.title}</h3>
                    <div className={`px-3 py-1 rounded-full text-xs font-mono bg-gradient-to-r ${stat.gradient} text-white`}>
                      {stat.value}
                    </div>
                  </div>
                  <p className="text-gray-400">{stat.description}</p>
                </div>
              ))}
            </div>
            
            <div className="relative h-[500px] rounded-2xl overflow-hidden border border-purple-500/30 bg-black/40">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  <div 
                    className="absolute inset-0 rounded-full border-4 animate-ping"
                    style={{
                      borderColor: 'rgba(79, 70, 229, 0.4)',
                      animationDuration: '3s'
                    }}
                  />
                  <div 
                    className="absolute inset-2 rounded-full border-4"
                    style={{
                      borderColor: 'rgba(124, 58, 237, 0.6)',
                      animation: 'pulse 8s linear infinite'
                    }}
                  />
                  <div 
                    className="absolute inset-4 rounded-full border-4"
                    style={{
                      borderColor: 'rgba(168, 85, 247, 0.8)'
                    }}
                  />
                  
                  <div className="relative z-10 bg-gradient-to-br from-purple-900 to-cyan-900 border-2 border-purple-500 rounded-xl p-6 w-80 h-80 flex flex-col items-center justify-center">
                    <div className="text-purple-300 mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 5.584a9.821 9.821 0 012.585 2.126c.123.152.24.308.352.468M14.5 7a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM9.596 8.573a9.823 9.823 0 01-3.332-.818M4.71 10.202a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zm1.389 4.595a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm3.45-1.277a9.823 9.823 0 013.332-.818m2.723 3.99a9.822 9.822 0 01-2.585 2.126M13 18a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm4.71-1.798a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zm1.979 3.383a9.821 9.821 0 01-4.063.833M12 21a9 9 0 110-18 9 9 0 010 18z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold mb-1">DSN ARRAY</h3>
                    <p className="text-center text-purple-200 text-sm">
                      Goldstone • Madrid • Canberra
                    </p>
                    <div className="mt-4 flex space-x-2">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-12 border-t border-purple-500/20 bg-black/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
            <div>
              <div className="flex items-center justify-center md:justify-start mb-4">
                <div className="text-cyan-400 mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-cyan-300 to-purple-400 bg-clip-text text-transparent">STELLARIS</span>
              </div>
              <p className="text-gray-400 max-w-xs mx-auto md:mx-0">
                Real-time space exploration data and mission monitoring for scientists, educators, and space enthusiasts.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-bold mb-4 bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">MISSION CONTROL</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-cyan-300 transition">Telemetry Dashboard</a></li>
                <li><a href="#" className="hover:text-cyan-300 transition">Signal Analysis</a></li>
                <li><a href="#" className="hover:text-cyan-300 transition">Trajectory Visualization</a></li>
                <li><a href="#" className="hover:text-cyan-300 transition">Data Archives</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-bold mb-4 bg-gradient-to-r from-purple-300 to-pink-400 bg-clip-text text-transparent">CONTACT OPS</h3>
              <address className="text-gray-400 not-italic space-y-2">
                <div className="flex items-start">
                  <svg className="w-5 h-5 mr-2 mt-0.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Deep Space Network Complex<br />Goldstone, California</span>
                </div>
                <div className="flex items-start">
                  <svg className="w-5 h-5 mr-2 mt-0.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>ops@stellaris-space.gov</span>
                </div>
              </address>
            </div>
          </div>
          
          <div className="border-t border-purple-500/20 mt-12 pt-8 text-center text-gray-500 text-sm">
            <p>© {new Date().getFullYear()} STELLARIS SPACE SYSTEMS • DATA SYNCHRONIZED WITH NASA/JPL GROUND STATIONS • CLASSIFIED CLEARANCE LEVEL: OMEGA</p>
          </div>
        </div>
      </footer>

      {/* Status notification */}
      {status && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg backdrop-blur-sm z-50 border ${
          status.startsWith('✅') 
            ? 'bg-emerald-900/80 border-emerald-500/30 text-emerald-200' 
            : 'bg-red-900/80 border-red-500/30 text-red-200'
        }`}>
          <div className="flex items-center">
            <svg className={`w-5 h-5 mr-2 ${status.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={status.startsWith('✅') ? "M5 13l4 4L19 7" : "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"} />
            </svg>
            <span className="font-mono">{status}</span>
          </div>
        </div>
      )}
      
      {/* Inject keyframe animations */}
      <style jsx global>{`
        @keyframes gradientBG {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes float {
          0% { background-position: 0% 0%; }
          50% { background-position: 100% 100%; }
          100% { background-position: 0% 0%; }
        }
        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
          100% { transform: scale(0.95); opacity: 1; }
        }
      `}</style>
    </div>
  );
}