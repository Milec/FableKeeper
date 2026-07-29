import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { BackstoryGenerator } from "@/modules/generators/backstory-generator";

export const metadata: Metadata = { title: "Backstory Generator" };

export default function BackstoryPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
          <ScrollText className="h-7 w-7 text-primary" />
          Backstory Generator
        </h1>
        <p className="text-muted-foreground">
          A ready-to-use backstory: summary, full history, future goals, and
          adventure hooks. Optionally seed it with a name.
        </p>
      </div>
      <BackstoryGenerator />
    </div>
  );
}
