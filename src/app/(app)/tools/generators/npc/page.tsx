import type { Metadata } from "next";
import { User } from "lucide-react";
import { NpcGenerator } from "@/modules/generators/npc-generator";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "NPC Generator" };

export default function NpcPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        icon={User}
        title="NPC Generator"
        description={
          <>
            Generate a full NPC — personality, ideals, bonds, flaws, hooks, and
            a portrait prompt. Copy it as markdown into a World Builder entry.
          </>
        }
      />
      <NpcGenerator />
    </div>
  );
}
