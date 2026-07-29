import type { Metadata } from "next";
import { User } from "lucide-react";
import { NpcGenerator } from "@/modules/generators/npc-generator";

export const metadata: Metadata = { title: "NPC Generator" };

export default function NpcPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
          <User className="h-7 w-7 text-primary" />
          NPC Generator
        </h1>
        <p className="text-muted-foreground">
          Generate a full NPC — personality, ideals, bonds, flaws, hooks, and a
          portrait prompt. Copy it as markdown into a World Builder entry.
        </p>
      </div>
      <NpcGenerator />
    </div>
  );
}
