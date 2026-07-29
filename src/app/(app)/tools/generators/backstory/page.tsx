import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { BackstoryGenerator } from "@/modules/generators/backstory-generator";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Backstory Generator" };

export default function BackstoryPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        icon={ScrollText}
        title="Backstory Generator"
        description={
          <>
            A ready-to-use backstory: summary, full history, future goals, and
            adventure hooks. Optionally seed it with a name.
          </>
        }
      />
      <BackstoryGenerator />
    </div>
  );
}
