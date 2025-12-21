// lib/diff.ts
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface DiffResult {
  html: string;
  changes: number;
}

// Naive word-based diff (replace later with `diff` library if needed)
export function generateDiffHtml(original: string, edited: string): DiffResult {
  const words1 = original.split(/\s+/).filter(w => w.length > 0);
  const words2 = edited.split(/\s+/).filter(w => w.length > 0);
  
  let html = '';
  let i = 0, j = 0;
  let changes = 0;

  while (i < words1.length || j < words2.length) {
    if (i < words1.length && j < words2.length && words1[i] === words2[j]) {
      html += escapeHtml(words1[i]) + ' ';
      i++;
      j++;
    } else {
      // Find the next matching word (simple greedy alignment)
      const nextMatch = words2.indexOf(words1[i], j);
      if (nextMatch !== -1 && nextMatch - j < 5) {
        // Insert intermediate words
        while (j < nextMatch) {
          html += `<ins>${escapeHtml(words2[j])}</ins> `;
          changes++;
          j++;
        }
      } else if (i < words1.length) {
        html += `<del>${escapeHtml(words1[i])}</del> `;
        changes++;
        i++;
      }
      if (j < words2.length && (i >= words1.length || words1[i] !== words2[j])) {
        html += `<ins>${escapeHtml(words2[j])}</ins> `;
        changes++;
        j++;
      }
    }
  }

  return {
    html: `<div style="white-space: pre-wrap;">${html.trim()}</div>`,
    changes
  };
}