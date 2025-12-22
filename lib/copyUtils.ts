import { ViewMode } from '@/hooks/useAIEditor';

export const isChapterHeading = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  
  const chapterPatterns = [
    /^CHAPTER\s+\d+/i,
    /^CHAPTER\s+[IVXLCDM]+/i,
    /^PART\s+\d+/i,
    /^SECTION\s+\d+/i,
    /^ACT\s+\d+/i,
    /^PROLOGUE$/i,
    /^EPILOGUE$/i,
    /^INTRODUCTION$/i,
    /^CONCLUSION$/i,
    /^[A-Z\s,:.'-]{3,50}$/, // All-caps section headings
    // Enhanced pattern for "Chapter ..." with strict word boundaries and subtitle support
    /^(?:Chapter|CHAPTER)\s+(?:\d+|(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:[-\s][A-Z][a-z]+)?))(?:\s*[:–—-]\s*.+)?$/i,
    // Additional patterns for common chapter formats
    /^(?:Chapter|CHAPTER)\s+(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/i, // "Chapter One", "Chapter Twenty Three"
    /^(?:Chapter|CHAPTER)\s+\d+$/i, // "Chapter 1", "Chapter 23"
    /^(?:Chapter|CHAPTER)\s+[IVXLCDM]+$/i, // "Chapter IV"
  ];
  
  return chapterPatterns.some(pattern => pattern.test(trimmed));
};

export const formatHtmlWithParagraphs = (htmlContent: string): string => {
  const paragraphs = htmlContent.split(/\n\s*\n/);
  
  return paragraphs.map((paragraph) => {
    if (!paragraph.trim()) return '';
    
    const cleanParagraph = paragraph.replace(/^\s+|\s+$/g, '');
    const paragraphText = cleanParagraph.replace(/<[^>]*>/g, '').trim();
    const isHeading = isChapterHeading(paragraphText);
    
    const lines = cleanParagraph.split('\n');
    const formattedLines = lines.map(line => line.trim()).filter(line => line);
    
    if (formattedLines.length === 0) return '';
    
    const paragraphContent = formattedLines.length > 1 
      ? formattedLines.join('<br>')
      : formattedLines[0];
    
    if (isHeading) {
      return `<p class="chapter-heading"><strong>${paragraphContent}</strong></p>`;
    } else {
      return `<p>${paragraphContent}</p>`;
    }
  }).filter(p => p).join('');
};

export const generatePlainTextWithSpacing = (htmlContent: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  let plainText = '';

  const paragraphs = Array.from(doc.querySelectorAll('p'));
  paragraphs.forEach((p, index) => {
    const text = (p.textContent || '').trim();
    if (!text) return;

    const isHeading = p.classList.contains('chapter-heading');

    if (isHeading) {
      if (plainText !== '') {
        plainText += '\n\n'; // Double space BEFORE chapter headings
      }
      plainText += text;
    } else {
      if (plainText !== '') {
        plainText += '\n\n';
      }
      plainText += text;
    }
  });

  // Fallback if no <p> tags
  if (plainText.trim() === '') {
    return htmlContent.replace(/<[^>]*>/g, '').trim();
  }

  return plainText.trim();
};

export const handleCopy = async (
  activeView: ViewMode,
  resultClean: string,
  resultTracked: string,
  showStatus: (type: 'success' | 'error' | 'warning' | 'info', message: string, duration?: number) => void
): Promise<void> => {
  try {
    if (activeView === 'clean') {
      await navigator.clipboard.writeText(resultClean);
      showStatus('success', 'Text copied!', 2000);
      return;
    }

    const formattedTracked = formatHtmlWithParagraphs(resultTracked);
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tracked Changes</title>
  <style>
    p { margin: 0 0 1em 0; line-height: 1.5; }
    p.chapter-heading {
      margin: 2em 0 1em 0 !important; /* Double space above chapter headings */
      text-align: center;
      font-weight: bold;
      page-break-after: avoid;
    }
    ins { 
      background: #e6ffe6; 
      text-decoration: underline; 
      color: #006400;
    }
    del { 
      background: #ffe6e6; 
      text-decoration: line-through; 
      color: #b22222;
    }
    @media print {
      p.chapter-heading { margin: 2em 0 1em 0 !important; }
    }
    @supports (mso) {
      p.chapter-heading { 
        margin-top: 24pt !important; 
        margin-bottom: 12pt !important; 
        page-break-after: avoid;
      }
    }
  </style>
</head>
<body>
  ${formattedTracked}
</body>
</html>`;

    const plainText = generatePlainTextWithSpacing(formattedTracked);

    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([plainText], { type: 'text/plain' });
      
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob
        })
      ]);
      
      showStatus('success', 'Tracked changes copied', 2000);
      return;
    }

    await navigator.clipboard.writeText(plainText);
    showStatus('success', 'Text copied with chapter spacing!', 2000);
  } catch (err) {
    console.error('[Copy Utils] Modern copy failed:', err);
    
    try {
      const textToCopy = activeView === 'clean' 
        ? resultClean 
        : generatePlainTextWithSpacing(formatHtmlWithParagraphs(resultTracked));
      
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      
      showStatus('success', 'Text copied (legacy method)!', 2000);
    } catch (fallbackErr) {
      console.error('[Copy Utils] Legacy copy failed:', fallbackErr);
      showStatus('error', 'Copy failed. Please select and copy manually.', 3000);
    }
  }
};