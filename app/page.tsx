// app/editor/page.tsx — The Magical Landing Page (Polished)

'use client';

import { useState, useEffect } from 'react';
import { PageWithChrome } from '@/components/PageWithChrome';

export default function EditorLanding() {
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Detect touch support for better mobile UX
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const tools = [
    {
      id: 'editor',
      title: 'AI Editor',
      emoji: '✨',
      description: 'Polish your book with AI — proofread, rewrite, or formalize.',
      link: '/editor/ai',
      comingSoon: false,
    },
    {
      id: 'write',
      title: 'Write Studio',
      emoji: '📖',
      description: 'Your main writing space — with history, versions, and AI sparks.',
      link: '/write',
      comingSoon: false,
    },
    {
      id: 'portfolio',
      title: 'Portfolio',
      emoji: '🖼️',
      description: 'Showcase your published work, novels, and creative projects.',
      link: '/portfolio',
      comingSoon: false,
    },
    {
      id: 'blog',
      title: 'Blog',
      emoji: '✍️',
      description: 'Draft, edit, and publish articles or journal entries.',
      link: '/blog',
      comingSoon: false,
    },
    {
      id: 'image-analysis',
      title: 'Image Analysis',
      emoji: '👁️',
      description: 'Upload images to extract text, analyze content, or generate ideas.',
      link: '/image-analysis',
      comingSoon: true,
    },
  ];

  return (
    <PageWithChrome>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-10 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 tracking-tight">
              Before Publishing
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
              Polish your work with these writing and editing tools — before it goes live.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {tools.map((tool) => (
              <div
                key={tool.id}
                className={`group relative p-6 rounded-2xl border-2 transition-all duration-300 cursor-pointer overflow-hidden shadow-sm
                  ${tool.comingSoon ? 'border-gray-300 bg-gray-50' : 'border-blue-400 bg-white'}
                  ${activeCard === tool.id ? 'bg-rose-50 shadow-md' : ''}
                  ${!tool.comingSoon && !isTouchDevice ? 'hover:bg-rose-25 hover:shadow-md' : ''}
                `}
                onClick={() => {
                  if (!tool.comingSoon) {
                    setActiveCard(tool.id);
                    setTimeout(() => {
                      window.location.href = tool.link;
                    }, 150); // slight delay for visual feedback
                  }
                }}
                // For keyboard navigation
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!tool.comingSoon) {
                      setActiveCard(tool.id);
                      setTimeout(() => {
                        window.location.href = tool.link;
                      }, 150);
                    }
                  }
                }}
                tabIndex={tool.comingSoon ? -1 : 0}
                role="button"
                aria-disabled={tool.comingSoon}
              >
                {/* Coming Soon Badge — Top Right */}
                {tool.comingSoon && (
                  <div className="absolute top-4 right-4 z-10">
                    <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                      Coming Soon
                    </span>
                  </div>
                )}

                {/* Emoji + Title */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{tool.emoji}</span>
                  <h2 className="text-xl font-bold text-gray-900">{tool.title}</h2>
                </div>

                {/* Description */}
                <p className="text-gray-600 text-sm leading-relaxed">{tool.description}</p>

                {/* Go-to indicator (only for available tools) */}
                {!tool.comingSoon && (
                  <div className="mt-5 flex justify-end">
                    <span className={`text-sm font-semibold text-blue-600 transition-all duration-200
                      ${activeCard === tool.id 
                        ? 'opacity-100 translate-x-0' 
                        : isTouchDevice 
                          ? 'opacity-0' 
                          : 'opacity-0 group-hover:opacity-100 translate-x-1'}
                    `}>
                      → Go to {tool.title}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="text-center mt-12 text-gray-500 text-sm">
            More tools coming soon. Ready to refine your voice before you publish?
          </div>
        </div>
      </div>
    </PageWithChrome>
  );
}