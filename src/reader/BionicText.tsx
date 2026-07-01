import { splitBionic } from './bionic';

/**
 * Renders the inline bionic markup for a single token's text (§7.1):
 * `{lead}<b>{head}</b>{tail}`. Pure CSS bolding, cheap to render.
 *
 * Callers decide *whether* to use this (global toggle + word-like check); when
 * a token has no letters to anchor on, this degrades to plain text.
 */
export function BionicText({ text, ratio }: { text: string; ratio: number }) {
  const { lead, head, tail } = splitBionic(text, ratio);

  if (!head) return <>{text}</>;

  return (
    <>
      {lead}
      <b className="bionic-head">{head}</b>
      {tail}
    </>
  );
}
