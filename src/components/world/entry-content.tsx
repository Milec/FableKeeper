"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { renderWikiLinks } from "@/lib/world/wikilinks";
import { cn } from "@/lib/utils";

export interface WikiResolver {
  /** Map of slug → entry URL for links that resolve within this world. */
  hrefBySlug: Record<string, string>;
  /** URL template for creating a missing entry; `{slug}` is replaced. */
  createHref?: string;
}

/**
 * Renders an entry's markdown body, first converting `[[wiki links]]` into
 * markdown links. Resolved links navigate to the target entry; unresolved links
 * render in a muted "missing" style (optionally linking to a create flow).
 */
export function EntryContent({
  markdown,
  resolver,
  className,
}: {
  markdown: string;
  resolver: WikiResolver;
  className?: string;
}) {
  if (!markdown.trim()) {
    return (
      <p className="text-sm italic text-muted-foreground">No content yet.</p>
    );
  }

  const processed = renderWikiLinks(
    markdown,
    (slug) => resolver.hrefBySlug[slug] ?? null,
  );

  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert prose-headings:font-display prose-a:text-primary",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, title, children, ...props }: ComponentPropsWithoutRef<"a"> & { href?: string }) => {
            // Missing wiki link: title carries `missing:<slug>`.
            if (title?.startsWith("missing:")) {
              const slug = title.slice("missing:".length);
              const createHref = resolver.createHref?.replace("{slug}", slug);
              const cls = "text-muted-foreground underline decoration-dashed underline-offset-2";
              return createHref ? (
                <Link href={createHref} className={cls} title="Create this entry">
                  {children}
                </Link>
              ) : (
                <span className={cls}>{children}</span>
              );
            }
            // Internal links → client-side navigation.
            if (href?.startsWith("/")) {
              return (
                <Link href={href} {...props}>
                  {children}
                </Link>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
