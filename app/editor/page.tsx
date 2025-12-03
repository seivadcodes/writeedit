// /app/editor/page.tsx
import { EditorUI } from '@/components/EditorUI';

export const metadata = {
  title: 'Before Publishing — Editorial Board',
};

export default function EditorPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <EditorUI />
    </div>
  );
}