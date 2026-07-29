"use client";

import {
  RichMarkdownEditor,
  type LinkTarget,
} from "@/components/editor/rich-markdown-editor";
import type { WikiResolver } from "@/components/world/entry-content";

const EMPTY_RESOLVER: WikiResolver = { hrefBySlug: {} };

/**
 * Markdown editor with a formatting toolbar, shared by the session, quest, and
 * character editors. Thin wrapper over `RichMarkdownEditor` so every markdown
 * surface in the app gets the same toolbar and (where link targets are supplied)
 * the same entry linking.
 */
export function MarkdownField({
  name,
  defaultValue = "",
  placeholder,
  resolver = EMPTY_RESOLVER,
  linkTargets = [],
  minHeight = "14rem",
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  resolver?: WikiResolver;
  linkTargets?: LinkTarget[];
  minHeight?: string;
}) {
  return (
    <RichMarkdownEditor
      name={name}
      defaultValue={defaultValue}
      placeholder={placeholder}
      resolver={resolver}
      linkTargets={linkTargets}
      minHeight={minHeight}
    />
  );
}
