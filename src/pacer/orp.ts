/**
 * Optimal Recognition Point (ORP) for RSVP mode (§7.3, M5).
 *
 * One anchor letter (the ORP) is highlighted and pinned to a fixed focal x; the
 * rest of the word extends left/right around it. The anchor index is chosen by
 * word length so it sits slightly left-of-centre — where the eye naturally
 * fixates.
 *
 * The unit the anchor is chosen from is a **grapheme cluster**, not a code
 * point — see `toGraphemeClusters` and DECISIONS.md D118 (issue #87).
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
  /**
   * The single anchor grapheme cluster (the red, pinned letter). One rendered
   * unit — usually one code point, but a base character plus its combining
   * marks / conjunct continuation for scripts that need it (issue #87).
   */
  anchor: string;
  /** Characters after the anchor (extend rightward). */
  post: string;
}

/** Unicode category M (Mn/Mc/Me) — any combining mark. */
const COMBINING_MARK = /\p{M}/u;

const ZWJ = 0x200d;
/** Regional indicator range — pairs form one flag cluster. */
const RI_FIRST = 0x1f1e6;
const RI_LAST = 0x1f1ff;

/**
 * Conjunct linkers (Unicode 15.1 `InCB=Linker`, UAX #29 rule GB9c) plus the
 * Khmer subscript sign. A consonant following one of these joins the same
 * cluster, so `हिन्दी` clusters as `हि` + `न्दी` rather than splitting the
 * conjunct. Deliberately NOT Tamil/Telugu/Kannada/Oriya viramas — ICU does not
 * bind those either, and matching ICU is the accuracy target (FINDINGS F41).
 */
const CONJUNCT_LINKERS = new Set([
  0x094d, // ० DEVANAGARI SIGN VIRAMA
  0x09cd, // ০ BENGALI SIGN VIRAMA
  0x0acd, // ૦ GUJARATI SIGN VIRAMA
  0x0d4d, // ൦ MALAYALAM SIGN VIRAMA
  0x17d2, // ៑ KHMER SIGN COENG
]);

/**
 * Split `text` into grapheme clusters — the units a reader perceives as single
 * characters.
 *
 * Deliberately hand-rolled rather than using `Intl.Segmenter`: Hermes (React
 * Native's engine, and this module is a core/ seed for the Android port) lists
 * the entire `intl402/Segmenter/` test262 suite in its **permanent** skip list,
 * so the API is not merely missing but declared out of scope there. The rules
 * below reproduce `Intl.Segmenter`'s grapheme output exactly on every script
 * tested (31/31, FINDINGS F41) using only `\p{M}`, which IS available on
 * Hermes. See DECISIONS.md D118.
 *
 * A cluster is extended by: any combining mark; a ZWJ and whatever follows it
 * (emoji sequences); a consonant following a conjunct linker; and the second
 * half of a regional-indicator pair (flags).
 */
export function toGraphemeClusters(text: string): string[] {
  const clusters: string[] = [];
  // Trailing code point of the cluster being built, and its length in code
  // points — both needed to decide whether the NEXT code point joins it.
  let lastCode = -1;
  let lastLength = 0;

  for (const ch of text) {
    const code = ch.codePointAt(0) ?? -1;

    if (clusters.length > 0) {
      if (
        COMBINING_MARK.test(ch) ||
        code === ZWJ ||
        lastCode === ZWJ ||
        CONJUNCT_LINKERS.has(lastCode)
      ) {
        clusters[clusters.length - 1] += ch;
        lastCode = code;
        lastLength++;
        continue;
      }
      // A regional indicator joins only a lone preceding one, so a run of four
      // makes two flags rather than one four-code-point blob.
      if (
        code >= RI_FIRST &&
        code <= RI_LAST &&
        lastCode >= RI_FIRST &&
        lastCode <= RI_LAST &&
        lastLength === 1
      ) {
        clusters[clusters.length - 1] += ch;
        lastCode = code;
        lastLength++;
        continue;
      }
    }

    clusters.push(ch);
    lastCode = code;
    lastLength = 1;
  }

  return clusters;
}

/** Split a token into pre / anchor / post around its ORP letter. */
export function splitOrp(text: string): OrpSplit {
  // Normalize to NFC first: splitting a decomposed (NFD) string leaves a base
  // character and its combining mark(s) in separate units — e.g. NFD "naïve"
  // can anchor on a bare diaeresis, detached from its "i" (issue #77). NFC
  // composes any sequence that has a precomposed equivalent, which covers all
  // standard Latin/Cyrillic/Greek accented letters.
  //
  // NFC alone is not enough, though: Devanagari, Thai, Hebrew-with-points,
  // Tamil and friends have NO precomposed forms, so NFC is a no-op for them
  // and the anchor could still land on a bare matra/vowel-sign/point (issue
  // #87). Clustering below is what fixes those — the anchor is always a whole
  // grapheme cluster, so it can never be a bare mark by construction.
  //
  // For ASCII and precomposed Latin one cluster IS one code point, so the
  // index arithmetic — and therefore the anchor — is byte-identical to the
  // pre-clustering behaviour (FINDINGS F41).
  const clusters = toGraphemeClusters(text.normalize('NFC'));
  if (clusters.length === 0) return { pre: '', anchor: '', post: '' };
  const idx = Math.min(orpIndex(clusters.length), clusters.length - 1);
  return {
    pre: clusters.slice(0, idx).join(''),
    anchor: clusters[idx],
    post: clusters.slice(idx + 1).join(''),
  };
}
