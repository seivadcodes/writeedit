// app/api/edit/route.ts
import { NextRequest, NextResponse } from 'next/server';

// ✅ Centralized model list — edit ONLY this array to add/remove models
const FREE_MODELS = [
  'mistralai/devstral-2512:free',
  'kwaipilot/kat-coder-pro:free',
  'google/gemini-flash-1.5-8b:free',
  'anthropic/claude-3.5-sonnet:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'meta-llama/llama-3.2-90b-vision-instruct:free',
  'deepseek/deepseek-r1-0528:free',
  'tngtech/deepseek-r1t2-chimera:free',
];

function sanitizePlainText(text: string): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    // Preserve paragraph breaks while normalizing other whitespace
    .replace(/([^\n])\n(?!\n)/g, '$1 ')  // Replace single line breaks with spaces
    .replace(/\n{3,}/g, '\n\n')          // Normalize excessive paragraph breaks
    .replace(/[ \t]+/g, ' ')             // Normalize spaces/tabs within paragraphs
    .trim();
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { input, instruction, editLevel, numVariations = 1 } = body;
  
  if (!instruction || !editLevel) {
    return NextResponse.json(
      { error: 'Missing instruction or editLevel' },
      { status: 400 }
    );
  }
  
  const variations = Math.min(Math.max(parseInt(numVariations as any, 10) || 1, 1), 5);
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    console.error('❌ Missing OPENROUTER_API_KEY');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  
  const VALID_MODELS = FREE_MODELS.filter(m => typeof m === 'string' && m.endsWith(':free'));
  if (VALID_MODELS.length === 0) {
    return NextResponse.json(
      { error: 'No valid free models configured' },
      { status: 500 }
    );
  }
  
  let systemPrompt = '';
  if (editLevel === 'proofread') {
    systemPrompt = `You are a meticulous proofreader. Fix ONLY the following:
- Spelling errors (e.g., "recieve" → "receive")
- Grammar mistakes (subject-verb agreement, incorrect verb tense, missing articles)
- Punctuation (add missing periods, commas, fix quotation marks)
- Capitalization (sentence starts and proper nouns)
NEVER:
- Rephrase sentences
- Change word choice (even if awkward or informal)
- Alter tone, voice, or style
- Add, remove, or reorder ideas
- Use ANY formatting (e.g., **bold**, *italic*, headings, lists, markdown, or labels)
Return ONLY the corrected plain text — nothing else.`;
  } else if (editLevel === 'rewrite') {
    systemPrompt = `You are an expert editor. Improve clarity, flow, and readability while:
- Preserving the original meaning exactly
- Keeping the same tone (e.g., casual, academic, persuasive)
- Fixing awkward or ambiguous phrasing
- Avoiding unnecessary wordiness
Do NOT:
- Invent new facts, examples, or details
- Change the author's intent or core message
- Use overly formal language unless the original is formal
- Use ANY formatting (like **bold**, *italic*, markdown, or UI labels)
Return ONLY the improved plain text — nothing else.`;
  } else if (editLevel === 'formal') {
    systemPrompt = `You are a professional editor. Convert this text to formal, polished English by:
- Replacing all contractions ("don't" → "do not", "it's" → "it is")
- Removing slang, idioms, and colloquial expressions
- Using precise, objective, and grammatically complete sentences
- Maintaining all original facts and meaning
Do NOT:
- Add filler phrases like "It is important to note that..."
- Simplify or omit technical or nuanced content
- Change the core message or intent
- Use ANY formatting (e.g., **bold**, markdown, headings)
Return ONLY the formal plain text — nothing else.`;
  } else if (editLevel === 'generate') {
    systemPrompt = `You are a skilled blog writer. Generate a complete, engaging, and well-structured blog post based on the user's instruction. 
Include:
- A compelling title
- A short excerpt (1–2 sentences)
- A full body with paragraphs, examples, and a natural tone
- No markdown, no formatting, just plain text
- Do NOT include any disclaimers like "Here is a blog post..." or "As an AI..."
Return ONLY the following JSON object, with no additional text before or after:
{
  "title": "Generated Title",
  "excerpt": "Brief summary...",
  "content": "Full blog content here..."
}
DO NOT ADD ANYTHING ELSE. NO EXPLANATIONS. NO MARKDOWN. JUST THE JSON.`;
  } else {
    systemPrompt = `You are an expert editor. Follow the user's instruction precisely while maintaining the core meaning and intent of the original text. 
NEVER use markdown, bold (**), italic (*), headings, or any formatting. 
Return ONLY the edited plain text — nothing else.`;
  }
  
  const userPrompt = `Instruction: "${instruction}"${input ? `\nText: "${input}"` : ''}`;
  
  async function makeCompletionWithModel(useModel: string, temp: number) {
    const origin = (request.headers.get('origin') || 'https://beforepublishing.vercel.app ').trim();
    const apiRes = await fetch('https://openrouter.ai/api/v1/chat/completions ', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': origin,
        'X-Title': 'Before Publishing',
      },
      body: JSON.stringify({
        model: useModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: editLevel === 'generate' ? 1200 : 800,
        temperature: temp,
      }),
    });
    
    if (!apiRes.ok) {
      const errData = await apiRes.json().catch(() => ({}));
      const msg = errData.error?.message || apiRes.statusText;
      throw new Error(`HTTP ${apiRes.status}: ${msg}`);
    }
    
    const data = await apiRes.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    if (!content) throw new Error('Empty response from model');
    return content;
  }
  
  async function tryModelsUntilSuccess(models: string[], temp: number) {
    let lastError: Error | null = null;
    for (const model of models) {
      try {
        const output = await makeCompletionWithModel(model, temp);
        console.log(`✅ Success with model: ${model}`);
        return { output, model };
      } catch (err) {
        console.warn(`❌ Model ${model} failed:`, (err as Error).message);
        lastError = err as Error;
      }
    }
    throw lastError || new Error('All models failed');
  }
  
  try {
    if (editLevel === 'generate') {
      const { output: rawOutput, model: usedModel } = await tryModelsUntilSuccess(VALID_MODELS, 0.9);
      console.log(`📝 Used model for generate: ${usedModel}`);
      
      const extractJson = (str: string) => {
        if (!str) return null;
        let start = str.indexOf('{');
        let end = str.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) return null;
        let jsonStr = str.slice(start, end + 1);
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed && typeof parsed === 'object') {
            return parsed;
          }
        } catch (e) {
          console.warn('JSON parse error:', (e as Error).message);
        }
        return null;
      };
      
      let parsed = extractJson(rawOutput);
      if (!parsed || !parsed.title || !parsed.content) {
        console.warn('AI JSON fallback triggered. Raw:', rawOutput.substring(0, 300));
        parsed = {
          title: "AI-Generated Blog Post",
          excerpt: "Generated by AI. Please review before publishing.",
          content: rawOutput || "No content generated."
        };
      }
      
      // For generate, content may contain prose — sanitize it too
      parsed.content = sanitizePlainText(parsed.content);
      parsed.excerpt = sanitizePlainText(parsed.excerpt);
      return NextResponse.json({ generatedPost: parsed });
    } else {
      if (variations === 1) {
        const { output, model: usedModel } = await tryModelsUntilSuccess(VALID_MODELS, 0.7);
        console.log(`📝 Used model for edit: ${usedModel}`);
        const cleanedOutput = sanitizePlainText(output);
        return NextResponse.json({ editedText: cleanedOutput });
      } else {
        const { model: workingModel } = await tryModelsUntilSuccess(VALID_MODELS, 0.7);
        const temps = [0.6, 0.7, 0.8, 0.9, 1.0].slice(0, variations);
        const promises = temps.map(temp =>
          makeCompletionWithModel(workingModel, temp).catch(err => {
            console.warn(`Variation failed (model=${workingModel}):`, (err as Error).message);
            return null;
          })
        );
        
        const results = (await Promise.all(promises))
          .filter(r => typeof r === 'string')
          .map(r => sanitizePlainText(r)) as string[];
        
        if (results.length === 0) results.push(input ? sanitizePlainText(input) : 'No alternative available.');
        return NextResponse.json({ variations: results });
      }
    }
  } catch (err) {
    console.error('Server error in /api/edit:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405 });
}