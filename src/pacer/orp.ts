/**
 * Optimal Recognition Point (ORP) for RSVP mode (§7.3, M5).
 *
 * One anchor letter (the ORP) is highlighted and pinned to a fixed focal x; the
 * rest of the word extends left/right around it. The anchor index is chosen by
 * word length so it sits slightly left-of-centre — where the eye naturally
 * fixates.
 */

/** Anchor character index for a word of the given length. */
export function orpIndex(length: number): number {
  if (length <= 1) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  if (length <= 13) return 3;
  return 4;
}

export interface OrpSplit {
  /** Characters before the anchor (extend leftward). */
  pre: string;
  /** The single anchor character (the red, pinned letter). */
  anchor: string;
  /** Characters after the anchor (extend rightward). */
  post: string;
}

/** Split a token into pre / anchor / post around its ORP letter. */
export function splitOrp(text: string): OrpSplit {
  const chars = [...text];
  if (chars.length === 0) return { pre: '', anchor: '', post: '' };
  const idx = Math.min(orpIndex(chars.length), chars.length - 1);
  return {
    pre: chars.slice(0, idx).join(''),
    anchor: chars[idx],
    post: chars.slice(idx + 1).join(''),
  };
}
