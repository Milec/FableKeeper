/**
 * Pure helper (safe to import on the client) for reading the markdown body out
 * of a session/quest `content` jsonb value.
 */
export function contentMarkdown(content: unknown): string {
  const c = content as { markdown?: unknown } | null;
  return typeof c?.markdown === "string" ? c.markdown : "";
}
