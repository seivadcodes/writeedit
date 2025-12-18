// app/api/edit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// ================
// TYPES
// ================

type TokenUsage = {
  input: number;
  output: number;
  total: number;
};

type EditLog = {
  round: number;
  model: string;
  duration: number;
  tokens: TokenUsage;
  success: boolean;
  error?: string;
  inputPreview: string;
  outputPreview: string;
};

// ================
// VALIDATION
// ================

const EditRequestSchema = z.object({
  text: z.string().min(1, 'Text cannot be empty'),
  level: z.enum(['proofread', 'rewrite', 'formal', 'custom']),
  customInstruction: z.string().optional(),
  model: z.string(),
  useEditorialBoard: z.boolean().default(false),
});

// ================
// MODEL CONFIGURATION
// ================

const MODEL_CONFIG = {
  'x-ai/grok-4.1-fast:free': {
    provider: 'xai',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    modelName: 'grok-beta',
    getHeaders: () => {
      const key = process.env.XAI_API_KEY;
      if (!key) throw new Error('Missing XAI_API_KEY');
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      };
    },
    maxTokens: 8192,
    contextWindow: 128000,
  },
  'anthropic/claude-3.5-sonnet:free': {
    provider: 'anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    modelName: 'claude-3-5-sonnet-20240620',
    getHeaders: () => {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error('Missing ANTHROPIC_API_KEY');
      return {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      };
    },
    maxTokens: 4096,
    contextWindow: 200000,
  },
  'openai/gpt-4o-mini:free': {
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    modelName: 'gpt-4o-mini',
    getHeaders: () => {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('Missing OPENAI_API_KEY');
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      };
    },
    maxTokens: 16384,
    contextWindow: 128000,
  },
} as const;

type ModelId = keyof typeof MODEL_CONFIG;

// ================
// PROMPTS
// ================

const SYSTEM_PROMPTS = {
  proofread: `You are a world-class proofreader with expertise in multiple languages. 
Fix all grammatical errors, spelling mistakes, punctuation issues, and awkward phrasing.
Maintain the original tone and meaning. Output ONLY the corrected text with no additional commentary.`,

  rewrite: `You are an award-winning editor specializing in clarity and conciseness.
Rewrite the text to be more engaging and readable while preserving all key information.
Improve flow, eliminate redundancies, and enhance sentence structure.
Output ONLY the rewritten text with no additional commentary.`,

  formal: `You are a professional editor for academic and business documents.
Convert the text to formal language suitable for scholarly publications or executive communications.
Remove colloquialisms, strengthen weak phrasing, and ensure precise terminology.
Output ONLY the formal version with no additional commentary.`,

  custom: (instruction: string) =>
    `You are an expert editor following this specific instruction:
"${instruction}"
Output ONLY the edited text with no additional commentary.`,
};

// ================
// HELPERS
// ================

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

// ================
// MODEL CALLER
// ================

async function callModel(
  text: string,
  level: string,
  customInstruction: string,
  modelConfig: (typeof MODEL_CONFIG)[ModelId],
  round: number
): Promise<{ content: string; tokens: TokenUsage }> {
  const systemPrompt =
    level === 'custom'
      ? SYSTEM_PROMPTS.custom(customInstruction)
      : SYSTEM_PROMPTS[level as keyof typeof SYSTEM_PROMPTS];

  const headers = modelConfig.getHeaders();
  const payload =
    modelConfig.provider === 'anthropic'
      ? {
          model: modelConfig.modelName,
          max_tokens: modelConfig.maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: text }],
        }
      : {
          model: modelConfig.modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          max_tokens: modelConfig.maxTokens,
          temperature: 0.3,
        };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 28000); // 28s

  try {
    const startTime = Date.now();
    const response = await fetch(modelConfig.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();
    const duration = Date.now() - startTime;

    let content = '';
    let tokens: TokenUsage = { input: 0, output: 0, total: 0 };

    if (modelConfig.provider === 'anthropic') {
      content = result.content?.[0]?.text || '';
      tokens = {
        input: result.usage?.input_tokens || 0,
        output: result.usage?.output_tokens || 0,
        total: (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0),
      };
    } else {
      content = result.choices?.[0]?.message?.content || '';
      tokens = {
        input: result.usage?.prompt_tokens || 0,
        output: result.usage?.completion_tokens || 0,
        total: (result.usage?.prompt_tokens || 0) + (result.usage?.completion_tokens || 0),
      };
    }

    return {
      content: content.trim(),
      tokens,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Model timed out after 28 seconds (Round ${round})`);
    }
    throw new Error(`Model call failed: ${getErrorMessage(error)}`);
  }
}

// ================
// MAIN HANDLER
// ================

export const maxDuration = 55; // Vercel timeout limit (max 60s)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = EditRequestSchema.parse(body);
    const { text, level, customInstruction, model, useEditorialBoard } = validated;

    const modelKey = model as ModelId;
    if (!(modelKey in MODEL_CONFIG)) {
      return NextResponse.json({ error: `Unsupported model: ${model}` }, { status: 400 });
    }

    const editorialModels = useEditorialBoard
      ? (['x-ai/grok-4.1-fast:free', 'anthropic/claude-3.5-sonnet:free', 'openai/gpt-4o-mini:free'] as const)
      : [modelKey];

    let currentText = text;
    const logs: EditLog[] = [];
    const startTime = Date.now();

    for (let round = 1; round <= editorialModels.length; round++) {
      const modelId = editorialModels[round - 1];
      const config = MODEL_CONFIG[modelId];

      // Truncate to 80% of context window for safety
      currentText = truncateText(currentText, Math.floor(config.contextWindow * 0.8));

      const roundStart = Date.now();
      try {
        const { content, tokens } = await callModel(
          currentText,
          level,
          customInstruction || '',
          config,
          round
        );

        currentText = content;
        logs.push({
          round,
          model: modelId,
          duration: Date.now() - roundStart,
          tokens,
          success: true,
          inputPreview: currentText.slice(0, 100).replace(/\n/g, ' ') + '...',
          outputPreview: content.slice(0, 100).replace(/\n/g, ' ') + '...',
        });
      } catch (error) {
        const duration = Date.now() - roundStart;
        logs.push({
          round,
          model: modelId,
          duration,
          tokens: { input: 0, output: 0, total: 0 },
          success: false,
          error: getErrorMessage(error),
          inputPreview: currentText.slice(0, 100).replace(/\n/g, ' ') + '...',
          outputPreview: '',
        });

        // In editorial board mode, continue to next model
        if (!useEditorialBoard) {
          throw error;
        }
      }
    }

    return NextResponse.json({
      editedText: currentText,
      meta: {
        totalDuration: Date.now() - startTime,
        rounds: editorialModels.length,
        editorialBoard: useEditorialBoard,
        logs,
      },
    });
  } catch (error) {
    console.error('Edit API error:', error);
    return NextResponse.json(
      {
        error: getErrorMessage(error),
        logs: (error as any).logs || [],
      },
      { status: 500 }
    );
  }
}