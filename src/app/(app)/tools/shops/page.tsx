import type { Metadata } from "next";
import { Store } from "lucide-react";
import { ShopGenerator } from "@/modules/generators/shop-generator";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Shop Generator" };

export default function ShopsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        icon={Store}
        title="Shop Generator"
        description={
          <>
            Generate a shop with a keeper, description, and an inventory that
            scales to the settlement. Copy it out as a markdown table.
          </>
        }
      />
      <ShopGenerator />
    </div>
  );
}
