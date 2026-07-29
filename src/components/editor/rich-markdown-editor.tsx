"use client";

import * as React from "react";
import {
  Bold,
  Code,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pencil,
  Quote,
  Strikethrough,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntryContent, type WikiResolver } from "@/components/world/entry-content";
import {
  applyCommand,
  detectWikiLinkQuery,
  insertWikiLink,
  type EditorCommand,
  type TextState,
} from "@/lib/editor/markdown-commands";
import { cn } from "@/lib/utils";

const EMPTY_RESOLVER: WikiResolver = { hrefBySlug: {} };

/** An entry that can be linked to, for the picker and autocomplete. */
export interface LinkTarget {
  title: string;
  type?: string;
}

interface ToolButton {
  command: EditorCommand;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
}

const GROUPS: ToolButton[][] = [
  [
    { command: "bold", icon: Bold, label: "Bold", shortcut: "⌘B" },
    { command: "italic", icon: Italic, label: "Italic", shortcut: "⌘I" },
    { command: "strikethrough", icon: Strikethrough, label: "Strikethrough" },
    { command: "code", icon: Code, label: "Inline code" },
  ],
  [
    { command: "h1", icon: Heading1, label: "Heading 1" },
    { command: "h2", icon: Heading2, label: "Heading 2" },
    { command: "h3", icon: Heading3, label: "Heading 3" },
  ],
  [
    { command: "bulletList", icon: List, label: "Bullet list" },
    { command: "numberedList", icon: ListOrdered, label: "Numbered list" },
    { command: "quote", icon: Quote, label: "Quote" },
    { command: "divider", icon: Minus, label: "Divider" },
  ],
];

/**
 * Markdown editor with a formatting toolbar and entry linking.
 *
 * Two ways to link, so nobody has to remember the `[[…]]` syntax:
 *   - the Link button opens a searchable list of entries in this world;
 *   - typing `[[` pops up inline autocomplete over the same list.
 *
 * All text manipulation is delegated to the pure helpers in
 * `@/lib/editor/markdown-commands` so the behaviour is unit-tested.
 */
export function RichMarkdownEditor({
  name,
  defaultValue = "",
  placeholder,
  resolver = EMPTY_RESOLVER,
  linkTargets = [],
  minHeight = "22rem",
  onChange,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  resolver?: WikiResolver;
  linkTargets?: LinkTarget[];
  minHeight?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = React.useState(defaultValue);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  // Inline `[[` autocomplete state.
  const [autocomplete, setAutocomplete] = React.useState<{
    query: string;
    from: number;
    to: number;
  } | null>(null);
  const [highlight, setHighlight] = React.useState(0);

  // Link-button picker state.
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerQuery, setPickerQuery] = React.useState("");

  const update = (next: TextState) => {
    setValue(next.text);
    onChange?.(next.text);
    // Restore the caret after React re-renders the textarea.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  };

  const currentState = (): TextState => {
    const el = ref.current;
    return {
      text: value,
      selectionStart: el?.selectionStart ?? value.length,
      selectionEnd: el?.selectionEnd ?? value.length,
    };
  };

  const run = (command: EditorCommand) => update(applyCommand(currentState(), command));

  const matches = React.useMemo(() => {
    const q = (autocomplete?.query ?? "").trim().toLowerCase();
    const pool = linkTargets;
    if (!q) return pool.slice(0, 8);
    return pool.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 8);
  }, [autocomplete?.query, linkTargets]);

  const pickerMatches = React.useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return linkTargets.slice(0, 30);
    return linkTargets.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 30);
  }, [pickerQuery, linkTargets]);

  /** Complete an in-progress `[[…` with the chosen title. */
  const completeAutocomplete = (title: string) => {
    if (!autocomplete) return;
    const { from, to } = autocomplete;
    const text = value.slice(0, from) + `[[${title}]]` + value.slice(to);
    const caret = from + title.length + 4;
    setAutocomplete(null);
    update({ text, selectionStart: caret, selectionEnd: caret });
  };

  const onTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setValue(next);
    onChange?.(next);
    const caret = e.target.selectionStart ?? next.length;
    const detected = linkTargets.length ? detectWikiLinkQuery(next, caret) : null;
    setAutocomplete(detected);
    setHighlight(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Autocomplete navigation takes priority while the popup is open.
    if (autocomplete && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        completeAutocomplete(matches[highlight]!.title);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAutocomplete(null);
        return;
      }
    }

    // Familiar formatting shortcuts.
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase();
      const map: Record<string, EditorCommand> = { b: "bold", i: "italic" };
      if (map[key]) {
        e.preventDefault();
        run(map[key]!);
      }
    }
  };

  return (
    <Tabs defaultValue="write">
      <div className="flex flex-wrap items-center gap-2">
        <TabsList>
          <TabsTrigger value="write">
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Write
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Preview
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="write" className="space-y-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 bg-muted/40 p-1">
          {GROUPS.map((group, gi) => (
            <React.Fragment key={gi}>
              {gi > 0 && <span className="mx-1 h-5 w-px bg-border" aria-hidden />}
              {group.map(({ command, icon: Icon, label, shortcut }) => (
                <button
                  key={command}
                  type="button"
                  onClick={() => run(command)}
                  title={shortcut ? `${label} (${shortcut})` : label}
                  aria-label={label}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </React.Fragment>
          ))}

          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <button
            type="button"
            onClick={() => {
              setPickerQuery("");
              setPickerOpen((o) => !o);
            }}
            title="Link to an entry"
            aria-label="Link to an entry"
            aria-expanded={pickerOpen}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium transition-colors",
              pickerOpen
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Link2 className="h-4 w-4" />
            Link entry
          </button>
          <span className="ml-auto hidden pr-2 text-[11px] text-muted-foreground sm:block">
            Markdown · type <code className="font-mono">[[</code> to link
          </span>
        </div>

        {/* Link picker */}
        {pickerOpen && (
          <div className="border-x bg-background p-2">
            <input
              autoFocus
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Search entries to link…"
              className="mb-1 flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {linkTargets.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                No other entries in this world yet — create one and it becomes
                linkable here.
              </p>
            ) : (
              <ul className="max-h-48 overflow-y-auto">
                {pickerMatches.map((t) => (
                  <li key={t.title}>
                    <button
                      type="button"
                      onClick={() => {
                        update(insertWikiLink(currentState(), t.title));
                        setPickerOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{t.title}</span>
                      {t.type && (
                        <span className="text-xs capitalize text-muted-foreground">
                          {t.type.replace(/_/g, " ")}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
                {pickerMatches.length === 0 && (
                  <li className="px-2 py-2 text-xs text-muted-foreground">
                    No entries match.
                  </li>
                )}
              </ul>
            )}
          </div>
        )}

        {/* Editor + inline autocomplete */}
        <div className="relative">
          <Textarea
            ref={ref}
            name={name}
            value={value}
            onChange={onTextChange}
            onKeyDown={onKeyDown}
            onBlur={() => window.setTimeout(() => setAutocomplete(null), 150)}
            placeholder={placeholder}
            className="rounded-t-none font-mono text-sm"
            style={{ minHeight }}
          />
          {autocomplete && matches.length > 0 && (
            <div className="absolute left-2 top-2 z-20 w-72 overflow-hidden rounded-md border bg-popover shadow-lg">
              <p className="border-b px-2 py-1 text-[11px] text-muted-foreground">
                Link an entry — ↑↓ then Enter
              </p>
              <ul>
                {matches.map((t, i) => (
                  <li key={t.title}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        completeAutocomplete(t.title);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm",
                        i === highlight && "bg-accent",
                      )}
                    >
                      <span className="flex-1 truncate">{t.title}</span>
                      {t.type && (
                        <span className="text-xs capitalize text-muted-foreground">
                          {t.type.replace(/_/g, " ")}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="preview">
        <div className="rounded-md border p-4" style={{ minHeight }}>
          <EntryContent markdown={value} resolver={resolver} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
