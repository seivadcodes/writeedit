// /components/TrackedChangesView.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { diffWords } from 'diff';

export interface ChangeGroup {
  id: string;
  original: string;
  edited: string;
  resolved?: 'accepted' | 'rejected' | 'pending';
  resolvedText?: string;
}

interface TrackedChangesViewProps {
  originalText: string;
  editedText: string;
  onAcceptChange?: (group: ChangeGroup) => void;
  onRejectChange?: (group: ChangeGroup) => void;
  className?: string;
}

export function TrackedChangesView({
  originalText,
  editedText,
  onAcceptChange,
  onRejectChange,
  className = '',
}: TrackedChangesViewProps) {
  const [groups, setGroups] = useState<ChangeGroup[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const escapeHtml = (unsafe: string): string => {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  const buildChangeGroups = (): ChangeGroup[] => {
    const diffs = diffWords(originalText, editedText);
    const groups: ChangeGroup[] = [];
    let currentGroup: { original: string; edited: string } | null = null;

    for (let i = 0; i < diffs.length; i++) {
      const part = diffs[i];
      const isChange = part.removed || part.added;

      if (!isChange) {
        if (currentGroup) {
          groups.push({
            id: `change-${Date.now()}-${groups.length}`,
            original: currentGroup.original,
            edited: currentGroup.edited,
            resolved: 'pending',
          });
          currentGroup = null;
        }
        groups.push({
          id: `text-${i}`,
          original: part.value,
          edited: '',
          resolved: undefined,
        });
      } else {
        if (!currentGroup) {
          currentGroup = { original: '', edited: '' };
        }
        if (part.removed) {
          currentGroup.original += part.value;
        }
        if (part.added) {
          currentGroup.edited += part.value;
        }

        const nextPart = diffs[i + 1];
        const isNextUnchanged = nextPart && !nextPart.removed && !nextPart.added;
        const isLast = i === diffs.length - 1;

        if (isNextUnchanged || isLast) {
          groups.push({
            id: `change-${Date.now()}-${groups.length}`,
            original: currentGroup.original,
            edited: currentGroup.edited,
            resolved: 'pending',
          });
          currentGroup = null;
        }
      }
    }

    return groups;
  };

  useEffect(() => {
    if (originalText === '' && editedText === '') return;
    const newGroups = buildChangeGroups();
    setGroups(newGroups);
  }, [originalText, editedText]);

  const handleAccept = (group: ChangeGroup) => {
    const resolvedText = group.edited;
    const updatedGroup = { ...group, resolved: 'accepted' as const, resolvedText }; // ✅
    setGroups(prev =>
      prev.map(g => (g.id === group.id ? updatedGroup : g))
    );
    onAcceptChange?.(updatedGroup);
  };

  const handleReject = (group: ChangeGroup) => {
    const resolvedText = group.original;
    const updatedGroup = { ...group, resolved: 'rejected' as const, resolvedText }; // ✅
    setGroups(prev =>
      prev.map(g => (g.id === group.id ? updatedGroup : g))
    );
    onRejectChange?.(updatedGroup);
  };

  const renderGroup = (group: ChangeGroup) => {
    if (group.resolved === 'accepted' || group.resolved === 'rejected') {
      return <span key={group.id}>{escapeHtml(group.resolvedText || '')}</span>;
    }
    if (group.resolved === undefined) {
      return <span key={group.id}>{escapeHtml(group.original)}</span>;
    }

    return (
      <span
        key={group.id}
        className="change-group"
        style={{ position: 'relative', display: 'inline-block' }}
      >
        {group.original && <del>{escapeHtml(group.original)}</del>}
        {group.edited && <ins>{escapeHtml(group.edited)}</ins>}
        <div
          className="change-action"
          style={{
            display: 'none',
            position: 'absolute',
            top: '-22px',
            left: 0,
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: '4px',
            padding: '2px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            zIndex: 100,
            gap: '4px',
            alignItems: 'center',
            fontSize: '12px',
          }}
        >
          <button
            className="accept-change"
            onClick={() => handleAccept(group)}
            style={{ padding: '2px 6px', border: '1px solid #ccc', borderRadius: '3px', background: 'white', cursor: 'pointer', color: 'green' }}
          >
            ✅
          </button>
          <button
            className="reject-change"
            onClick={() => handleReject(group)}
            style={{ padding: '2px 6px', border: '1px solid #ccc', borderRadius: '3px', background: 'white', cursor: 'pointer', color: 'red' }}
          >
            ❌
          </button>
        </div>
        <style jsx>{`
          .change-group:hover .change-action {
            display: flex !important;
          }
          del {
            background-color: #ffe6e6;
            text-decoration: line-through;
            margin: 0 2px;
          }
          ins {
            background-color: #e6ffe6;
            text-decoration: none;
            margin: 0 2px;
          }
        `}</style>
      </span>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`tracked-changes-container ${className}`}
      style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}
    >
      {groups.map(renderGroup)}
    </div>
  );
}