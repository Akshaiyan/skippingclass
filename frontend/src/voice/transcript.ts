// The voice model marks how a line should be delivered with bracketed cues such as [excited], [curious],
// [laughs] or [whispers]. They steer the voice and aren't meant to be read, so the transcript drops them.

const CUE = /\[\s*[A-Za-z][A-Za-z '’,-]{0,40}\s*\]/g;

/** Aegis's words as they should read on screen: no delivery cues, tidy spacing. */
export function stripDeliveryCues(text: string): string {
  return text
    .replace(CUE, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}
