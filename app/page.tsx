// app/editor/page.tsx — The Magical Landing Page

'use client';

import { useState } from 'react';
import { PageWithChrome } from '@/components/PageWithChrome';

export default function EditorLanding() {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const tools = [
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
      id: 'editor',
      title: 'AI Editor',
      emoji: '✨',
      description: 'Paste text and refine it with AI — proofread, rewrite, or formalize.',
      link: '/editor/ai',
      comingSoon: true, // ← Mark as coming soon
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
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Optional: Keep this header only if PageWithChrome doesn't already have one */}
          {/* If you're getting a double header, consider removing this block entirely */}
          {/* 
          <div className="mb-8 flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-800">Before Publishing</h1>
            <div className="hidden md:flex gap-4 text-sm text-gray-600">
              {tools.map((tool) => (
                <a
                  key={tool.id}
                  href={tool.link}
                  className="hover:text-blue-600 transition-colors"
                >
                  {tool.title}
                </a>
              ))}
            </div>
          </div>
          */}

          {/* Main heading centered for landing feel */}
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-3">Before Publishing</h1>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Polish your work with these writing and editing tools — before it goes live.
            </p>
          </div>

          {/* Tool Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {tools.map((tool) => (
              <div
                key={tool.id}
                onMouseEnter={() => setHoveredCard(tool.id)}
                onMouseLeave={() => setHoveredCard(null)}
                className={`group relative p-6 rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden ${
                  hoveredCard === tool.id
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
                onClick={() => {
                  if (!tool.comingSoon) {
                    window.location.href = tool.link;
                  }
                }}
              >
                {/* Optional "Coming Soon" badge */}
                {tool.comingSoon && (
                  <div className="absolute top-3 right-3 bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-1 rounded-full">
                    Coming Soon
                  </div>
                )}

                {/* Emoji + Title */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{tool.emoji}</span>
                  <h2 className="text-xl font-semibold text-gray-800">{tool.title}</h2>
                </div>

                {/* Description */}
                <p className="text-gray-600 leading-relaxed text-sm">{tool.description}</p>

                {/* Arrow indicator — only for non-coming-soon */}
                {!tool.comingSoon && (
                  <div className="mt-4 flex justify-end">
                    <span className={`text-sm font-medium text-blue-600 transition-opacity ${
                      hoveredCard === tool.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}>
                      → Go to {tool.title}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer Note */}
          <div className="mt-12 text-center text-gray-500 text-sm">
            Use these tools to polish, publish, and perfect your work — before it goes live.
          </div>
        </div>
      </div>
    </PageWithChrome>
  );
}