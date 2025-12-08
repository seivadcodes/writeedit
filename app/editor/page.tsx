// /app/editor/page.tsx
import { EditorUI } from '@/components/EditorUI';
import { PageWithChrome } from '@/components/PageWithChrome';

export const metadata = {
  title: 'Before Publishing — Editorial Board',
};

export default function EditorPage() {
  return (
    <PageWithChrome>
      <div className="container mx-auto px-4 py-8">
        <EditorUI />
      </div>
    </PageWithChrome>
  );
}