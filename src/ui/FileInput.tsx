import { useRef, useState } from 'react';
import { computeFingerprint, parse, parseMarkdown, type Format } from '../parsers';
import type { Document } from '../model/types';
import { SAMPLE_MARKDOWN } from './sample';

/**
 * File input (§7.4) — a format selector (Markdown / PDF / EPUB) plus a picker,
 * drag-and-drop, and a Markdown "load sample" shortcut. The dropdown is the
 * explicit selector; the file's extension auto-selects it when recognized, so
 * the dropdown mainly disambiguates (e.g. a plain `.txt` treated as Markdown).
 */

// Fixed fingerprint for the built-in sample — same string every load so
// position history persists across sample sessions.
const SAMPLE_FINGERPRINT = '__builtin_sample__';

interface FileInputProps {
  onLoad: (doc: Document, fingerprint: string) => void;
  onError: (message: string) => void;
}

const FORMAT_OPTIONS: { id: Format; label: string }[] = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'pdf', label: 'PDF' },
  { id: 'epub', label: 'EPUB' },
];

const ACCEPT =
  '.md,.markdown,.txt,.pdf,.epub,text/markdown,text/plain,application/pdf,application/epub+zip';

/** Pick a format from a file extension, when recognized. */
function detectFormat(name: string): Format | undefined {
  const ext = name.toLowerCase().match(/\.([^.]+)$/)?.[1];
  if (ext === 'pdf') return 'pdf';
  if (ext === 'epub') return 'epub';
  if (ext === 'md' || ext === 'markdown' || ext === 'txt') return 'markdown';
  return undefined;
}

export function FileInput({ onLoad, onError }: FileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [format, setFormat] = useState<Format>('markdown');
  const [busy, setBusy] = useState(false);

  async function loadFile(file: File) {
    const resolved = detectFormat(file.name) ?? format;
    setFormat(resolved);
    setBusy(true);
    try {
      // Hash and parse run in parallel — both read the File independently.
      const [doc, fingerprint] = await Promise.all([
        parse(file, resolved),
        computeFingerprint(file),
      ]);
      onLoad(doc, fingerprint);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void loadFile(file);
  }

  return (
    <div
      className={`file-input${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void loadFile(file);
          e.target.value = ''; // allow re-selecting the same file
        }}
      />

      <label className="file-input-format">
        <span className="muted small">Format</span>
        <select
          className="mode-select"
          value={format}
          disabled={busy}
          onChange={(e) => setFormat(e.target.value as Format)}
        >
          {FORMAT_OPTIONS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <p className="file-input-hint">
        {busy ? 'Parsing…' : 'Drop a PDF, Markdown, or EPUB file here, or'}
      </p>

      <div className="file-input-actions">
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          Choose file
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => onLoad(parseMarkdown(SAMPLE_MARKDOWN, 'Sample'), SAMPLE_FINGERPRINT)}
        >
          Load sample
        </button>
      </div>

      <p className="file-input-note muted small">
        Everything is processed in your browser — nothing is uploaded. Scanned
        (image-only) PDFs aren&rsquo;t supported; convert those to Markdown or EPUB.
      </p>
    </div>
  );
}
