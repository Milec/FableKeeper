"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Repeatable text-row editor, used for feats. Serialises to a hidden JSON input
 * so the server action gets a clean array regardless of row churn.
 */
export function TextListEditor({
  name,
  initial,
  placeholder,
  addLabel,
  emptyHint,
}: {
  name: string;
  initial: string[];
  placeholder?: string;
  addLabel: string;
  emptyHint: string;
}) {
  const [items, setItems] = React.useState<string[]>(initial);
  const cleaned = items.map((i) => i.trim()).filter(Boolean);

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(cleaned)} />
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((value, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                value={value}
                placeholder={placeholder}
                aria-label={`${addLabel} ${i + 1}`}
                onChange={(e) =>
                  setItems((list) =>
                    list.map((x, idx) => (idx === i ? e.target.value : x)),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove"
                onClick={() => setItems((list) => list.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setItems((list) => [...list, ""])}
      >
        <Plus className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}

export interface InventoryItem {
  name: string;
  quantity: number;
}

/**
 * Name + quantity row editor for inventory. Emits Pathbuilder's `[name, qty]`
 * tuple shape so hand-edited and imported equipment stay interchangeable.
 */
export function InventoryEditor({
  name,
  initial,
}: {
  name: string;
  initial: InventoryItem[];
}) {
  const [items, setItems] = React.useState<InventoryItem[]>(initial);
  const cleaned = items
    .filter((i) => i.name.trim())
    .map((i) => [i.name.trim(), Math.max(1, i.quantity || 1)]);

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(cleaned)} />
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No equipment yet. Add weapons, armour, and gear.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={item.name}
                placeholder="Longsword"
                aria-label={`Item ${i + 1} name`}
                onChange={(e) =>
                  setItems((list) =>
                    list.map((x, idx) =>
                      idx === i ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
              <Input
                type="number"
                min={1}
                value={item.quantity}
                aria-label={`Item ${i + 1} quantity`}
                className="w-20 text-center"
                onChange={(e) =>
                  setItems((list) =>
                    list.map((x, idx) =>
                      idx === i ? { ...x, quantity: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove item"
                onClick={() => setItems((list) => list.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setItems((list) => [...list, { name: "", quantity: 1 }])}
      >
        <Plus className="h-4 w-4" />
        Add item
      </Button>
    </div>
  );
}
