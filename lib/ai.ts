// lib/ai.ts

export type EditLevel = 'proofread' | 'rewrite' | 'formal' | 'custom' | 'generate';

/**
 * Generates the appropriate system prompt based on edit level.
 */
export function getSystemPrompt(level: EditLevel, customInstruction?: string): string {
  switch (level) {
    case 'proofread':
      return `You are a meticulous proofreader. Fix ONLY the following:
- Spelling errors (e.g., "recieve" → "receive")
- Grammar mistakes (subject-verb agreement, incorrect verb tense, missing articles)
- Punctuation (add missing periods, commas, fix quotation marks)
- Capitalization (sentence starts and proper nouns)

NEVER:
- Rephrase sentences
- Change word choice (even if awkward or informal)
- Alter tone, voice, or style
- Add, remove, or reorder ideas

Return ONLY the corrected text — nothing else.`;

    case 'rewrite':
      return `You are an expert editor. Improve clarity, flow, and readability while:
- Preserving the original meaning exactly
- Keeping the same tone (e.g., casual, academic, persuasive)
- Fixing awkward or ambiguous phrasing
- Avoiding unnecessary wordiness

Do NOT:
- Invent new facts, examples, or details
- Change the author’s intent or core message
- Use overly formal language unless the original is formal

Return ONLY the improved text — nothing else.`;

    case 'formal':
      return `You are a professional editor. Convert this text to formal, polished English by:
- Replacing all contractions ("don't" → "do not", "it's" → "it is")
- Removing slang, idioms, and colloquial expressions
- Using precise, objective, and grammatically complete sentences
- Maintaining all original facts and meaning

Do NOT:
- Add filler phrases like "It is important to note that..."
- Simplify or omit technical or nuanced content
- Change the core message or intent

Return ONLY the formal version — nothing else.`;

    case 'generate':
      return `You are a skilled blog writer. Generate a complete, engaging, and well-structured blog post based on the user's instruction. 
Include:
- A compelling title
- A short excerpt (1–2 sentences)
- A full body with paragraphs, examples, and a natural tone
- No markdown, just plain text
- Do NOT include any disclaimers like "Here is a blog post..." or "As an AI..."

Return ONLY the following JSON object, with no additional text before or after:
{
  "title": "Generated Title",
  "excerpt": "Brief summary...",
  "content": "Full blog content here..."
}

DO NOT ADD ANYTHING ELSE. NO EXPLANATIONS. NO MARKDOWN. JUST THE JSON.`;

    case 'custom':
    default:
      return `You are an expert editor. ${customInstruction || 'Improve this text.'} 
Return ONLY the edited text — nothing else.`;
  }
}