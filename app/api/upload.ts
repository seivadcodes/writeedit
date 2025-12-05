// app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Ensure upload directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'public/uploads/test-uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export async function POST(request: NextRequest) {
  try {
    // Parse form data (requires next.config.js with bodyParser: false)
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const entityType = formData.get('entityType') as string;
    const entityId = formData.get('entityId') as string;

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Generate unique filename
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `${entityType}-${entityId}-${Date.now()}.${extension}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    // Convert Blob to buffer and save
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filepath, buffer);

    // Return success with URL
    const url = `/uploads/test-uploads/${filename}`;

    // In real app, you’d insert into SQL table test_uploads here
    // For now, we just log it
    console.log(`Uploaded: ${url} for ${entityType}/${entityId}`);

    return NextResponse.json({
      success: true,
      url,
      message: 'Upload successful',
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}