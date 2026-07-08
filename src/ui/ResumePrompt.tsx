import { useState } from 'react';
import type { BookRecord, PositionSnapshot } from '../storage/readingPosition';

function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min !== 1 ? 's' : ''} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr !== 1 ? 's' : ''} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day !== 1 ? 's' : ''} ago`;
}

interface ResumePromptProps {
  record: BookRecord;
  onResume: (wordIndex: number) => void;
  onStartOver: () => void;
}

export function ResumePrompt({ record, onResume, onStartOver }: ResumePromptProps) {
  const [showHistory, setShowHistory] = useState(false);

  const { latest, history, title } = record;
  const pct = Math.round(latest.percent * 100);

  // Show history entries that differ from latest by >5 % — ones close to latest
  // add no recovery value.
  const usefulHistory: PositionSnapshot[] = history.filter(
    (s) => Math.abs(s.percent - latest.percent) > 0.05,
  );

  return (
    <div className="resume-prompt">
      <header className="app-header">
        <h1>Reading Aid Tool</h1>
      </header>

      <div className="resume-card">
        <p className="resume-book-title">{title}</p>
        <p className="resume-message">
          Resume reading at <strong>{pct}%</strong>?{' '}
          <span className="muted small">Saved {relativeTime(latest.savedAt)}</span>
        </p>

        <div className="resume-actions">
          <button type="button" onClick={() => onResume(latest.wordIndex)}>
            Resume at {pct}%
          </button>
          <button type="button" className="secondary" onClick={onStartOver}>
            Start from beginning
          </button>
        </div>

        {usefulHistory.length > 0 && (
          <div className="resume-history">
            <button
              type="button"
              className="secondary"
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? '▲' : '▾'} Earlier positions ({usefulHistory.length})
            </button>
            {showHistory && (
              <ul className="resume-history-list">
                {usefulHistory.map((snap) => (
                  <li key={snap.savedAt}>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => onResume(snap.wordIndex)}
                    >
                      {Math.round(snap.percent * 100)}%
                      <span className="muted small"> — {relativeTime(snap.savedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
