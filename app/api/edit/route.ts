// app/api/edit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { splitIntoChunks } from '@/lib/chunking';
import { getSystemPrompt } from '@/lib/ai';

const ALLOWED_MODELS = [
  'x-ai/grok-4.1-fast:free',
  'alibaba/tongyi-deepresearch-30b-a3b:free',
  'kwaipilot/kat-coder-pro:free',
  'anthropic/claude-3.5-sonnet:free',
  'google/gemini-flash-1.5-8b:free'
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      input,
      instruction,
      model,
      editLevel,
      useEditorialBoard = false
    } = body;

    if (!input?.trim()) return NextResponse.json({ error: 'Input required' }, { status: 400 });
    if (!instruction?.trim()) return NextResponse.json({ error: 'Instruction required' }, { status: 400 });
    if (!model || !ALLOWED_MODELS.includes(model)) return NextResponse.json({ error: 'Invalid model' }, { status: 400 });

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

    const wordCount = input.trim().split(/\s+/).length;
    if (wordCount >= 1000) {
      return processChunkedEdit(input, instruction, model, editLevel, useEditorialBoard, OPENROUTER_API_KEY);
    }

    let finalText: string;
    if (useEditorialBoard) {
      finalText = await runSelfRefinementLoop(input, instruction, model, OPENROUTER_API_KEY);
    } else {
      finalText = await callModel(input, instruction, model, editLevel, OPENROUTER_API_KEY);
    }

    const { html: trackedHtml, changes } = generateTrackedChanges(input, finalText);

    return NextResponse.json({
      editedText: finalText,
      trackedHtml,
      changes
    });

  } catch (err: any) {
    console.error('❌ Edit API error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

// --- Core AI Functions ---

async function callModel(
  text: string,
  instruction: string,
  model: string,
  editLevel: string,
  apiKey: string
): Promise<string> {
  const system = getSystemPrompt(editLevel as any, instruction);
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://beforepublishing.vercel.app',
      'X-Title': 'Before Publishing'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text }
      ],
      max_tokens: 1000,
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || res.statusText);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || text;
}

async function runSelfRefinementLoop(
  original: string,
  instruction: string,
  model: string,
  apiKey: string
): Promise<string> {
  // Round 1
  let current = await callModel(original, instruction, model, 'custom', apiKey);
  // Round 2
  const prompt2 = `Original: "${original}"\nYour edit: "${current}"\nReview your work. Fix errors. Return ONLY improved text.`;
  current = await callModel(prompt2, 'Self-review', model, 'custom', apiKey);
  // Round 3
  const prompt3 = `Original: "${original}"\nCurrent: "${current}"\nFinal check. Return ONLY final text.`;
  current = await callModel(prompt3, 'Final polish', model, 'custom', apiKey);
  return current;
}

// --- Chunked Processing ---

async function processChunkedEdit(
  input: string,
  instruction: string,
  model: string,
  editLevel: string,
  useEditorialBoard: boolean,
  apiKey: string
) {
  const chunks = splitIntoChunks(input);
  const editedChunks = [];

  for (const chunk of chunks) {
    let edited = useEditorialBoard
      ? await runSelfRefinementLoop(chunk, instruction, model, apiKey)
      : await callModel(chunk, instruction, model, editLevel, apiKey);
    editedChunks.push(edited);
  }

  const finalText = editedChunks.join('\n\n');
  const { html: trackedHtml, changes } = generateTrackedChanges(input, finalText);

  return NextResponse.json({
    editedText: finalText,
    trackedHtml,
    changes
  });
}

// --- DIFF GENERATION (simplified but effective) ---

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function generateTrackedChanges(original: string, edited: string): { html: string; changes: number } {
  // For production, you can integrate a proper diff lib like `diff` on the server
  // But to keep it simple and match your UI, we’ll simulate grouping
  const words1 = original.split(/\s+/);
  const words2 = edited.split(/\s+/);
  const html: string[] = [];
  let i = 0, j = 0;
  let changes = 0;

  while (i < words1.length || j < words2.length) {
    if (i < words1.length && j < words2.length && words1[i] === words2[j]) {
      html.push(escapeHtml(words1[i]));
      i++; j++;
    } else {
      const startI = i;
      const startJ = j;
      // Skip over differences
      while (
        (i < words1.length && j < words2.length && words1[i] !== words2[j]) ||
        (i < words1.length && j >= words2.length) ||
        (i >= words1.length && j < words2.length)
      ) {
        if (i < words1.length) i++;
        if (j < words2.length) j++;
      }
      // Emit change group
      const deleted = words1.slice(startI, i).map(escapeHtml).join(' ');
      const inserted = words2.slice(startJ, j).map(escapeHtml).join(' ');
      if (deleted || inserted) {
        changes++;
        let group = '';
        if (deleted) group += `<del>${deleted}</del>`;
        if (inserted) group += `<ins>${inserted}</ins>`;
        html.push(`<span class="change-group">${group}</span>`);
      }
    }
  }

  return {
    html: `<div style="white-space: pre-wrap;">${html.join(' ')}<\/div>`,
    changes
  };
}