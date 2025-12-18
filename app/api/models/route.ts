// app/api/models/route.ts
export async function GET() {
  return Response.json([
    { 
      id: 'x-ai/grok-4.1-fast:free', 
      name: '🚀 Grok 4.1 (Fast & Accurate)', 
      description: 'Best for quick proofreading with excellent grammar correction',
      specialties: ['Grammar', 'Spelling', 'Punctuation']
    },
    { 
      id: 'anthropic/claude-3.5-sonnet:free', 
      name: '🎯 Claude 3.5 Sonnet', 
      description: 'Superior style and clarity improvements with natural flow',
      specialties: ['Style', 'Clarity', 'Flow']
    },
    { 
      id: 'openai/gpt-4o-mini:free', 
      name: '✨ GPT-4o Mini', 
      description: 'Best all-around editor with balanced improvements',
      specialties: ['Tone', 'Conciseness', 'Professionalism']
    }
  ]);
}