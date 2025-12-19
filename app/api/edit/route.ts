import { NextRequest, NextResponse } from 'next/server';
import { splitIntoOptimalChunks, reassembleChunks } from '@/lib/chunking';
import { getSystemPrompt } from '@/lib/ai';
import { v4 as uuidv4 } from 'uuid';

// All available free models with their rate limits and capabilities
const MODELS = [
  { id: 'mistralai/devstral-2512:free', maxTokens: 16000, requestsPerMinute: 3 },
  { id: 'kwaipilot/kat-coder-pro:free', maxTokens: 8000, requestsPerMinute: 5 },
  { id: 'anthropic/claude-3.5-sonnet:free', maxTokens: 20000, requestsPerMinute: 2 },
  { id: 'google/gemini-flash-1.5-8b:free', maxTokens: 12000, requestsPerMinute: 4 },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', maxTokens: 8000, requestsPerMinute: 6 },
  { id: 'qwen/qwen-2.5-72b-instruct:free', maxTokens: 30000, requestsPerMinute: 2 }
];

// Active processing jobs with their status
const processingJobs = new Map<string, ProcessingJob>();

interface ProcessingJob {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  totalChunks: number;
  completedChunks: number;
  chunks: ChunkProcessingStatus[];
  result?: string;
  error?: string;
  createdAt: Date;
  lastUpdate: Date;
}

interface ChunkProcessingStatus {
  chunkId: string;
  modelId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  editedText?: string;
  error?: string;
}

// Cleanup old jobs after 1 hour
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of processingJobs.entries()) {
    if (now - job.lastUpdate.getTime() > 3600000) { // 1 hour
      processingJobs.delete(id);
    }
  }
}, 300000); // Run cleanup every 5 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      input,
      instruction,
      editLevel,
      customInstruction,
      useEditorialBoard = false,
      jobId // Optional existing job ID for polling
    } = body;

    // If this is a status check for an existing job
    if (jobId) {
      const job = processingJobs.get(jobId);
      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      
      if (job.status === 'completed') {
        processingJobs.delete(jobId); // Clean up completed job
        return NextResponse.json({
          status: 'completed',
          editedText: job.result,
          usedModels: Array.from(new Set(job.chunks.map(c => c.modelId)))
        });
      } else if (job.status === 'failed') {
        processingJobs.delete(jobId); // Clean up failed job
        return NextResponse.json({ 
          status: 'failed', 
          error: job.error 
        }, { status: 500 });
      }
      
      // Still processing - return progress
      return NextResponse.json({
        status: 'processing',
        progress: job.progress,
        completedChunks: job.completedChunks,
        totalChunks: job.totalChunks
      });
    }

    // Validate input for new job
    if (!instruction?.trim() && editLevel !== 'generate') {
      return NextResponse.json({ error: 'Instruction required' }, { status: 400 });
    }

    if (editLevel !== 'generate' && !input?.trim()) {
      return NextResponse.json({ error: 'Input required' }, { status: 400 });
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'Server config error' }, { status: 500 });
    }

    // Create a new job ID
    const newJobId = uuidv4();
    
    // Split input into chunks with metadata
    const { chunks, metadata } = splitIntoOptimalChunks(
      input || '',
      Math.min(...MODELS.map(m => m.maxTokens)) * 0.6, // 60% of smallest model's capacity
      50 // Overlap words
    );

    // Initialize job status
    const job: ProcessingJob = {
      id: newJobId,
      status: 'processing',
      progress: 0,
      totalChunks: chunks.length,
      completedChunks: 0,
      chunks: chunks.map((_, i) => ({
        chunkId: metadata[i].id,
        modelId: '', // Will be assigned
        status: 'pending',
        retryCount: 0
      })),
      createdAt: new Date(),
      lastUpdate: new Date()
    };
    
    processingJobs.set(newJobId, job);
    
    console.log(`Created job ${newJobId} with ${chunks.length} chunks`);
    
    // Process in background without blocking the response
    processLargeDocument(
      newJobId, 
      chunks, 
      metadata, 
      instruction || customInstruction || getSystemPrompt(editLevel as any),
      editLevel,
      useEditorialBoard,
      OPENROUTER_API_KEY
    ).catch(error => {
      console.error(`Background processing failed for job ${newJobId}:`, error);
      const job = processingJobs.get(newJobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message || 'Processing failed';
        job.lastUpdate = new Date();
      }
    });
    
    // Return job ID immediately for client to poll status
    return NextResponse.json({
      jobId: newJobId,
      status: 'processing',
      totalChunks: chunks.length
    }, { status: 202 }); // 202 Accepted

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('❌ Edit API error:', errorMessage);
    return NextResponse.json({ error: errorMessage || 'Internal error' }, { status: 500 });
  }
}

async function processLargeDocument(
  jobId: string,
  chunks: string[],
  metadata: any[],
  instruction: string,
  editLevel: string,
  useEditorialBoard: boolean,
  apiKey: string
) {
  const job = processingJobs.get(jobId);
  if (!job) return;

  console.log(`Starting processing for job ${jobId} with ${chunks.length} chunks`);
  
  try {
    // Assign chunks to models in round-robin fashion
    const modelAssignment = assignChunksToModels(chunks.length);
    
    // Update job with model assignments
    for (let i = 0; i < job.chunks.length; i++) {
      job.chunks[i].modelId = modelAssignment[i];
    }
    
    // Process chunks in batches to respect rate limits
    const results = await processChunksInBatches(
      chunks,
      metadata,
      job.chunks,
      instruction,
      editLevel,
      useEditorialBoard,
      apiKey,
      jobId
    );
    
    // Reassemble the final text
    const finalText = reassembleChunks(chunks, results, metadata);
    
    // Update job status
    job.status = 'completed';
    job.result = finalText;
    job.progress = 100;
    job.completedChunks = chunks.length;
    job.lastUpdate = new Date();
    
    console.log(`Job ${jobId} completed successfully`);
    
    // Generate tracked changes for the UI (only if document isn't extremely large)
    if (chunks.length < 50) {
      const { html: trackedHtml, changes } = generateTrackedChanges(
        chunks.join('\n\n'), 
        finalText
      );
      
      job.result = JSON.stringify({
        editedText: finalText,
        trackedHtml,
        changes,
        usedModels: Array.from(new Set(job.chunks.map(c => c.modelId)))
      });
    }

  } catch (error: any) {
    console.error(`Processing failed for job ${jobId}:`, error);
    if (job) {
      job.status = 'failed';
      job.error = error.message || 'Processing failed';
      job.lastUpdate = new Date();
    }
  }
}

function assignChunksToModels(chunkCount: number): string[] {
  const assignments = [];
  let modelIndex = 0;
  
  for (let i = 0; i < chunkCount; i++) {
    assignments.push(MODELS[modelIndex].id);
    modelIndex = (modelIndex + 1) % MODELS.length;
  }
  
  return assignments;
}

async function processChunksInBatches(
  chunks: string[],
  metadata: any[],
  chunkStatuses: ChunkProcessingStatus[],
  instruction: string,
  editLevel: string,
  useEditorialBoard: boolean,
  apiKey: string,
  jobId: string
): Promise<string[]> {
  const results: (string | null)[] = new Array(chunks.length).fill(null);
  const maxConcurrentRequests = Math.min(10, MODELS.length * 2); // Limit concurrency
  const processingQueue = [...Array(chunks.length).keys()]; // Array of chunk indices
  
  // Track requests per model for rate limiting
  const modelRequestTracker = new Map<string, { count: number; timestamp: number }>();
  
  const processNextChunk = async (): Promise<boolean> => {
    if (processingQueue.length === 0) return false;
    
    const chunkIndex = processingQueue.shift()!;
    const chunk = chunks[chunkIndex];
    const chunkStatus = chunkStatuses[chunkIndex];
    const modelId = chunkStatus.modelId;
    
    // Check rate limits for this model
    const now = Date.now();
    const modelLimit = MODELS.find(m => m.id === modelId)!;
    const lastRequest = modelRequestTracker.get(modelId) || { count: 0, timestamp: 0 };
    
    if (lastRequest.count >= modelLimit.requestsPerMinute && 
        now - lastRequest.timestamp < 60000) {
      // Rate limit exceeded, put back in queue and wait
      processingQueue.unshift(chunkIndex);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      return true;
    }
    
    // Update request tracker
    modelRequestTracker.set(modelId, {
      count: lastRequest.count >= modelLimit.requestsPerMinute ? 1 : lastRequest.count + 1,
      timestamp: now
    });
    
    try {
      chunkStatus.status = 'processing';
      updateJobProgress(jobId);
      
      // Process the chunk with the assigned model
      let editedText: string;
      
      if (useEditorialBoard) {
        editedText = await runSelfRefinementLoop(
          chunk, 
          instruction, 
          modelId, 
          apiKey, 
          0.7,
          metadata[chunkIndex]
        );
      } else {
        editedText = await callModelWithTemp(
          chunk, 
          instruction, 
          modelId, 
          editLevel, 
          apiKey, 
          0.7, 
          false,
          metadata[chunkIndex]
        );
      }
      
      results[chunkIndex] = editedText;
      chunkStatus.status = 'completed';
      chunkStatus.editedText = editedText;
      
    } catch (error: any) {
      console.error(`Chunk ${chunkIndex} failed with model ${modelId}:`, error.message);
      chunkStatus.retryCount++;
      
      if (chunkStatus.retryCount < 3) {
        // Try with a different model on retry
        const nextModelIndex = (MODELS.findIndex(m => m.id === modelId) + 1) % MODELS.length;
        const nextModelId = MODELS[nextModelIndex].id;
        chunkStatus.modelId = nextModelId;
        console.log(`Retrying chunk ${chunkIndex} with model ${nextModelId}`);
        
        // Put back at the end of the queue
        processingQueue.push(chunkIndex);
      } else {
        // Final failure
        chunkStatus.status = 'failed';
        chunkStatus.error = error.message || 'Processing failed after retries';
        results[chunkIndex] = chunks[chunkIndex]; // Fallback to original text
      }
    } finally {
      chunkStatuses[chunkIndex] = chunkStatus;
      updateJobProgress(jobId);
    }
    
    return true;
  };
  
  // Process chunks concurrently within limits
  const workers = Array.from({ length: maxConcurrentRequests }, () => 
    (async () => {
      while (await processNextChunk()) {
        // Continue processing until queue is empty
      }
    })()
  );
  
  await Promise.all(workers);
  
  // Check for any failed chunks that need fallback handling
  for (let i = 0; i < results.length; i++) {
    if (results[i] === null) {
      console.warn(`Chunk ${i} has no result, using original text as fallback`);
      results[i] = chunks[i];
    }
  }
  
  return results as string[];
}

function updateJobProgress(jobId: string) {
  const job = processingJobs.get(jobId);
  if (!job) return;
  
  const completed = job.chunks.filter(c => c.status === 'completed').length;
  job.progress = Math.round((completed / job.totalChunks) * 100);
  job.completedChunks = completed;
  job.lastUpdate = new Date();
}

// Enhanced model calling with context awareness
async function callModelWithTemp(
  text: string,
  instruction: string,
  model: string,
  editLevel: string,
  apiKey: string,
  temperature: number,
  useEditorialBoard: boolean,
  chunkMetadata: any
): Promise<string> {
  const systemPrompt = getSystemPrompt(editLevel as any, instruction);
  
  // Add context about this being a chunk if needed
  let userPrompt = text;
  if (chunkMetadata.overlapStart || chunkMetadata.overlapEnd) {
    const contextHint = [
      "You are editing a section of a larger document.",
      chunkMetadata.overlapStart ? "This section starts with overlapping context from the previous section. Only edit the NEW content that follows this overlap." : "",
      chunkMetadata.overlapEnd ? "This section ends with overlapping context for the next section. Ensure your edit flows naturally to this overlap text." : "",
      "Return ONLY the edited text without any additional commentary."
    ].filter(Boolean).join(" ");
    
    userPrompt = `${contextHint}\n\nSECTION TO EDIT:\n${text}`;
  }
  
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
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2000, // Conservative limit for chunk processing
      temperature,
      top_p: temperature > 0.8 ? 0.95 : 0.9
    }),
    next: { revalidate: 0 } // Disable caching
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    const errorMsg = errJson?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(errorMsg);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Model returned empty content');
  }
  
  // If this is a chunk with overlap text, try to preserve the overlap parts
  if (chunkMetadata.overlapStart || chunkMetadata.overlapEnd) {
    return preserveOverlapBoundaries(text, content, chunkMetadata);
  }
  
  return content;
}

function preserveOverlapBoundaries(original: string, edited: string, metadata: any): string {
  let result = edited;
  
  // For start overlap, try to keep the first ~50 words similar to maintain continuity
  if (metadata.overlapStart) {
    const originalStartWords = original.split(/\s+/).slice(0, 30).join(' ');
    const editedStartWords = edited.split(/\s+/).slice(0, 30).join(' ');
    
    // If the edited start is significantly different, preserve the original overlap
    const similarity = calculateTextSimilarity(originalStartWords, editedStartWords);
    if (similarity < 0.6) { // 60% similarity threshold
      const editedContent = edited.split(/\s+/).slice(30).join(' ');
      result = originalStartWords + ' ' + editedContent;
    }
  }
  
  // For end overlap, try to keep the last ~50 words similar
  if (metadata.overlapEnd) {
    const originalEndWords = original.split(/\s+/).slice(-30).join(' ');
    const editedEndWords = edited.split(/\s+/).slice(-30).join(' ');
    
    const similarity = calculateTextSimilarity(originalEndWords, editedEndWords);
    if (similarity < 0.6) {
      const editedContent = edited.split(/\s+/).slice(0, -30).join(' ');
      result = editedContent + ' ' + originalEndWords;
    }
  }
  
  return result.trim();
}

function calculateTextSimilarity(text1: string, text2: string): number {
  // Simple word overlap similarity
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  
  let intersection = 0;
  words1.forEach(word => {
    if (words2.has(word)) intersection++;
  });
  
  return intersection / Math.max(words1.size, words2.size);
}

// Self refinement loop with context awareness
async function runSelfRefinementLoop(
  original: string,
  instruction: string,
  model: string,
  apiKey: string,
  baseTemp: number,
  chunkMetadata: any
): Promise<string> {
  let current = await callModelWithTemp(
    original, 
    instruction, 
    model, 
    'custom', 
    apiKey, 
    baseTemp, 
    false,
    chunkMetadata
  );
  
  // Self-review with context
  const reviewPrompt = `Original section: "${original}"\nYour edit: "${current}"\nReview your work. Fix errors. Preserve any overlapping context parts needed for continuity. Return ONLY improved text.`;
  current = await callModelWithTemp(
    reviewPrompt, 
    'Self-review', 
    model, 
    'custom', 
    apiKey, 
    Math.min(1.0, baseTemp + 0.1), 
    false,
    chunkMetadata
  );
  
  // Final polish
  const polishPrompt = `Original section: "${original}"\nCurrent version: "${current}"\nFinal check for quality and continuity. Return ONLY final text.`;
  current = await callModelWithTemp(
    polishPrompt, 
    'Final polish', 
    model, 
    'custom', 
    apiKey, 
    Math.min(1.0, baseTemp + 0.2), 
    false,
    chunkMetadata
  );
  
  return current;
}

// Simplified diff generation for large documents
function generateTrackedChanges(original: string, edited: string): { html: string; changes: number } {
  // For very large documents, skip detailed diff to save processing
  if (original.length > 50000 || edited.length > 50000) {
    return {
      html: `<div style="white-space: pre-wrap;">${escapeHtml(edited)}</div>`,
      changes: -1 // Indicates too large for detailed diff
    };
  }
  
  // Standard diff algorithm for smaller documents
  const words1 = original.split(/\s+/);
  const words2 = edited.split(/\s+/);
  const html: string[] = [];
  let i = 0, j = 0;
  let changes = 0;

  while (i < words1.length || j < words2.length) {
    if (i < words1.length && j < words2.length && words1[i] === words2[j]) {
      html.push(escapeHtml(words1[i]));
      i++;
      j++;
    } else {
      const startI = i;
      const startJ = j;
      while (
        (i < words1.length && j < words2.length && words1[i] !== words2[j]) ||
        (i < words1.length && j >= words2.length) ||
        (i >= words1.length && j < words2.length)
      ) {
        if (i < words1.length) i++;
        if (j < words2.length) j++;
      }
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
    html: `<div style="white-space: pre-wrap;">${html.join(' ')}</div>`,
    changes
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}