/**
 * Turning provider failures into something a GM can act on.
 *
 * Kept pure and separate from the API call so every branch is unit-testable
 * without a network or a key — which matters more here than usual, because
 * these messages are the *only* thing the person sees when generation fails,
 * and the free tier makes the quota branch a routine occurrence rather than an
 * edge case.
 */

/** Where to get a key, repeated in a few messages. */
export const AI_STUDIO_URL = "https://aistudio.google.com/apikey";

/** A rejected key looks like this in the error body, whatever the status is. */
const INVALID_KEY = /API_KEY_INVALID|API key not valid/i;

/**
 * Map a failure from the Gemini API onto a message.
 *
 * The distinction that matters is *who has to do something*: a rejected key is
 * the deployment's problem and needs a person with access to the secret, while
 * a quota error just needs waiting, and saying "check your key" for a 429 would
 * send them hunting for a fault that isn't there.
 *
 * `detail` is the raw error body the SDK puts on `ApiError.message`, and it is
 * needed rather than optional-nicety because **Gemini returns 400, not 401, for
 * a bad key** — so status alone would report the single most likely real
 * failure as an internal bug and send the reader looking in the wrong place.
 */
export function messageForStatus(status: number | undefined, detail?: string): string {
  if (INVALID_KEY.test(detail ?? "")) {
    return `The configured GEMINI_API_KEY was rejected. Get a fresh one at ${AI_STUDIO_URL}.`;
  }
  if (status === 400) {
    return "The request was rejected as malformed. This is a bug in FableKeeper, not something you did.";
  }
  if (status === 401 || status === 403) {
    return `The configured GEMINI_API_KEY was rejected or lacks access. Check it at ${AI_STUDIO_URL}.`;
  }
  if (status === 404) {
    return "The configured model doesn't exist or isn't available to this key.";
  }
  if (status === 429) {
    return "You've hit the free tier's rate limit. Wait a minute and try again — the quota resets on its own.";
  }
  if (status !== undefined && status >= 500) {
    return "The Gemini API is having trouble right now. Try again in a moment.";
  }
  return "Something went wrong generating that draft.";
}

/**
 * Map a safety block onto a message.
 *
 * Gemini can stop a generation in two different places — before it starts
 * (`promptFeedback.blockReason`, the brief itself was blocked) or partway
 * through (`finishReason`, the output was). Both leave no usable text, so both
 * have to be caught before reading the response, but only the first is
 * something rewording the brief can fix.
 */
export function messageForBlock(reason: string | undefined, where: "prompt" | "response"): string {
  if (reason === "PROHIBITED_CONTENT" || reason === "SAFETY") {
    return where === "prompt"
      ? "The assistant declined to write from that brief. Dark subject matter is usually fine — try describing it less graphically, or write this entry by hand."
      : "The assistant stopped partway through on a safety filter. Try rewording the brief, or write this entry by hand.";
  }
  if (reason === "MAX_TOKENS") {
    return "The draft ran past the length limit before it finished. Try a narrower brief.";
  }
  if (reason === "RECITATION") {
    return "The assistant stopped because the draft was reproducing existing text too closely. Try rewording the brief.";
  }
  return where === "prompt"
    ? "The assistant declined to write from that brief. Try rewording it, or write this entry by hand."
    : "The assistant stopped before finishing the draft. Try again.";
}

/**
 * Whether a `finishReason` means the response is usable.
 *
 * `STOP` is the normal ending. Anything else — a safety stop, a length cut-off,
 * a recitation halt — means the JSON is absent or truncated, so it must be
 * caught rather than parsed. Gemini also omits the field entirely on some
 * successful responses, so an absent reason counts as fine.
 */
export function isUsableFinish(reason: string | undefined): boolean {
  return reason === undefined || reason === "STOP";
}
