"use client";

import * as React from "react";
import { Eye, Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntryContent, type WikiResolver } from "@/components/world/entry-content";

const EMPTY_RESOLVER: WikiResolver = { hrefBySlug: {} };

/**
 * A reusable markdown editor with Write / Preview tabs. Used by session and
 * quest editors (and anywhere else that needs markdown input). The value is a
 * controlled textarea bound to a hidden-free form field via `name`.
 */
export function MarkdownField({
  name,
  defaultValue = "",
  placeholder,
  resolver = EMPTY_RESOLVER,
  minHeight = "14rem",
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  resolver?: WikiResolver;
  minHeight?: string;
}) {
  const [value, setValue] = React.useState(defaultValue);

  return (
    <Tabs defaultValue="write">
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
      <TabsContent value="write">
        <Textarea
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="font-mono text-sm"
          style={{ minHeight }}
        />
      </TabsContent>
      <TabsContent value="preview">
        <div className="rounded-md border p-4" style={{ minHeight }}>
          <EntryContent markdown={value} resolver={resolver} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
