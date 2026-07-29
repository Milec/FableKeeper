import type { Metadata } from "next";
import { Store } from "lucide-react";
import { ShopGenerator } from "@/modules/generators/shop-generator";

export const metadata: Metadata = { title: "Shop Generator" };

export default function ShopsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
          <Store className="h-7 w-7 text-primary" />
          Shop Generator
        </h1>
        <p className="text-muted-foreground">
          Generate a shop with a keeper, description, and an inventory that scales
          to the settlement. Copy it out as a markdown table.
        </p>
      </div>
      <ShopGenerator />
    </div>
  );
}
