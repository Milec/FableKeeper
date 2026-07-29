/**
 * Pure text transforms behind the editor toolbar.
 *
 * Each command takes the current text plus the selection range and returns the
 * new text and where the caret/selection should end up. Keeping this pure means
 * the formatting behaviour is unit-testable without a DOM, and the React
 * component stays a thin wrapper over a textarea.
 */

export interface TextState {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

export type EditorCommand =
  | "bold"
  | "italic"
  | "strikethrough"
  | "code"
  | "h1"
  | "h2"
  | "h3"
  | "quote"
  | "bulletList"
  | "numberedList"
  | "divider";

/** Wrap (or unwrap) the selection with a marker, e.g. `**` for bold. */
export function toggleWrap(state: TextState, marker: string, placeholder: string): TextState {
  const { text, selectionStart, selectionEnd } = state;
  const selected = text.slice(selectionStart, selectionEnd);
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);

  // Already wrapped? Unwrap.
  if (
    selected.length >= marker.length * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    return {
      text: before + inner + after,
      selectionStart,
      selectionEnd: selectionStart + inner.length,
    };
  }

  // Markers immediately outside the selection? Unwrap those too.
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return {
      text: before.slice(0, -marker.length) + selected + after.slice(marker.length),
      selectionStart: selectionStart - marker.length,
      selectionEnd: selectionEnd - marker.length,
    };
  }

  const body = selected || placeholder;
  return {
    text: `${before}${marker}${body}${marker}${after}`,
    selectionStart: selectionStart + marker.length,
    selectionEnd: selectionStart + marker.length + body.length,
  };
}

/** Expand a range to cover the whole lines it touches. */
function lineBounds(text: string, start: number, end: number): [number, number] {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = text.length;
  return [lineStart, lineEnd];
}

/**
 * Toggle a line prefix (`## `, `> `, `- `) across every selected line. If every
 * line already has the prefix it is removed, otherwise it is applied to all.
 */
export function toggleLinePrefix(state: TextState, prefix: string): TextState {
  const { text } = state;
  const [from, to] = lineBounds(text, state.selectionStart, state.selectionEnd);
  const block = text.slice(from, to);
  const lines = block.split("\n");

  // Treat other heading levels as replaceable so H2 → H3 works cleanly.
  const headingRe = /^#{1,6}\s+/;
  const isHeading = /^#{1,6}\s$/.test(prefix);

  const allHave = lines.every((l) => l.startsWith(prefix));
  const next = lines
    .map((line) => {
      if (allHave) return line.slice(prefix.length);
      const stripped = isHeading ? line.replace(headingRe, "") : line.replace(/^(>\s+|[-*]\s+)/, "");
      return prefix + stripped;
    })
    .join("\n");

  return {
    text: text.slice(0, from) + next + text.slice(to),
    selectionStart: from,
    selectionEnd: from + next.length,
  };
}

/** Number the selected lines `1.`, `2.`, … or strip existing numbering. */
export function toggleNumberedList(state: TextState): TextState {
  const { text } = state;
  const [from, to] = lineBounds(text, state.selectionStart, state.selectionEnd);
  const lines = text.slice(from, to).split("\n");
  const numbered = /^\d+\.\s+/;
  const allHave = lines.every((l) => numbered.test(l));

  const next = lines
    .map((line, i) => (allHave ? line.replace(numbered, "") : `${i + 1}. ${line.replace(numbered, "")}`))
    .join("\n");

  return {
    text: text.slice(0, from) + next + text.slice(to),
    selectionStart: from,
    selectionEnd: from + next.length,
  };
}

/** Insert arbitrary text at the caret, replacing any selection. */
export function insertText(state: TextState, snippet: string): TextState {
  const { text, selectionStart, selectionEnd } = state;
  return {
    text: text.slice(0, selectionStart) + snippet + text.slice(selectionEnd),
    selectionStart: selectionStart + snippet.length,
    selectionEnd: selectionStart + snippet.length,
  };
}

/** Insert a wiki link for an entry title, replacing any selection. */
export function insertWikiLink(state: TextState, title: string): TextState {
  const { text, selectionStart, selectionEnd } = state;
  const selected = text.slice(selectionStart, selectionEnd).trim();
  // Selected text becomes the display alias: [[Target|selected]].
  const snippet =
    selected && selected.toLowerCase() !== title.toLowerCase()
      ? `[[${title}|${selected}]]`
      : `[[${title}]]`;
  return insertText({ ...state, selectionStart, selectionEnd }, snippet);
}

/** Apply one of the toolbar commands. */
export function applyCommand(state: TextState, command: EditorCommand): TextState {
  switch (command) {
    case "bold":
      return toggleWrap(state, "**", "bold text");
    case "italic":
      return toggleWrap(state, "*", "italic text");
    case "strikethrough":
      return toggleWrap(state, "~~", "struck text");
    case "code":
      return toggleWrap(state, "`", "code");
    case "h1":
      return toggleLinePrefix(state, "# ");
    case "h2":
      return toggleLinePrefix(state, "## ");
    case "h3":
      return toggleLinePrefix(state, "### ");
    case "quote":
      return toggleLinePrefix(state, "> ");
    case "bulletList":
      return toggleLinePrefix(state, "- ");
    case "numberedList":
      return toggleNumberedList(state);
    case "divider":
      return insertText(state, "\n\n---\n\n");
  }
}

/**
 * Detect an in-progress `[[wiki link` at the caret, for autocomplete.
 * Returns the partial query and the span to replace, or null.
 */
export function detectWikiLinkQuery(
  text: string,
  caret: number,
): { query: string; from: number; to: number } | null {
  const open = text.lastIndexOf("[[", caret);
  if (open === -1) return null;
  // Already closed before the caret? Then we're not inside a link.
  const close = text.indexOf("]]", open);
  if (close !== -1 && close < caret) return null;
  const query = text.slice(open + 2, caret);
  // Bail out if the "link" spans a newline or contains a closing bracket.
  if (/[\n\]]/.test(query)) return null;
  return { query, from: open, to: caret };
}
