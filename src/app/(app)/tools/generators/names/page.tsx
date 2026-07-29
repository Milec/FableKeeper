import type { Metadata } from "next";
import { Type } from "lucide-react";
import { NameGenerator } from "@/modules/generators/name-generator";

export const metadata: Metadata = { title: "Name Generator" };

export default function NamesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
          <Type className="h-7 w-7 text-primary" />
          Name Generator
        </h1>
        <p className="text-muted-foreground">
          Names for people (by ancestry), settlements, taverns, and ships. Star
          the ones you like to keep them.
        </p>
      </div>
      <NameGenerator />
    </div>
  );
}
