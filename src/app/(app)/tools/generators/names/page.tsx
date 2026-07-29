import type { Metadata } from "next";
import { Type } from "lucide-react";
import { NameGenerator } from "@/modules/generators/name-generator";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Name Generator" };

export default function NamesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        icon={Type}
        title="Name Generator"
        description={
          <>
            Names for people (by ancestry), settlements, taverns, and ships.
            Star the ones you like to keep them.
          </>
        }
      />
      <NameGenerator />
    </div>
  );
}
