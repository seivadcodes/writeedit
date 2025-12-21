// app/api/models/route.ts
import { NextResponse } from 'next/server';
import { ALLOWED_MODELS, MODEL_METADATA } from '@/lib/models';

export async function GET() {
  const models = ALLOWED_MODELS.map(id => ({
    id,
    name: MODEL_METADATA[id].name,
    rpm: MODEL_METADATA[id].rpm,
  }));

  return NextResponse.json({ models });
}