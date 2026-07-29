"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import {
  generateShop,
  shopToMarkdown,
  SETTLEMENT_SIZES,
  type GeneratedShop,
  type SettlementSizeId,
} from "@/lib/generators/shop";
import { SHOP_TYPES } from "@/lib/generators/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { CopyButton } from "./copy-button";

export function ShopGenerator() {
  const [shopType, setShopType] = React.useState("any");
  const [size, setSize] = React.useState<SettlementSizeId>("town");
  const [level, setLevel] = React.useState(3);
  const [shop, setShop] = React.useState<GeneratedShop | null>(null);

  const generate = React.useCallback(() => {
    setShop(
      generateShop({ shopType, settlementSize: size, settlementLevel: level }),
    );
  }, [shopType, size, level]);

  React.useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="shopType">Shop type</Label>
          <Select id="shopType" value={shopType} onChange={(e) => setShopType(e.target.value)}>
            <option value="any">Any</option>
            {SHOP_TYPES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="size">Settlement size</Label>
          <Select id="size" value={size} onChange={(e) => setSize(e.target.value as SettlementSizeId)}>
            {SETTLEMENT_SIZES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="level">Settlement level</Label>
          <Input id="level" type="number" min={1} max={20} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
        </div>
      </div>

      <Button onClick={generate}>
        <RefreshCw className="h-4 w-4" />
        Generate shop
      </Button>

      {shop && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold">{shop.name}</h2>
                <p className="text-muted-foreground">{shop.type}</p>
              </div>
              <CopyButton text={shopToMarkdown(shop)} />
            </div>

            <p className="text-sm text-muted-foreground">{shop.description}</p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Item</th>
                    <th className="py-2 pr-4 font-medium">Price</th>
                    <th className="py-2 font-medium">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {shop.items.map((item, i) => (
                    <tr key={`${item.name}-${i}`} className="border-b last:border-0">
                      <td className="py-2 pr-4">{item.name}</td>
                      <td className="py-2 pr-4 tabular-nums">{item.price}</td>
                      <td className="py-2 tabular-nums">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
