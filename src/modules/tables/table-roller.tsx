"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dices } from "lucide-react";
import { createRng } from "@/lib/generators/random";
import {
  entryRanges,
  rollOnTable,
  tableFormula,
  type TableEntry,
} from "@/lib/tables/roll";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface HistoryItem {
  id: string;
  roll: number;
  total: number;
  text: string;
}

/** Rolls on a table (custom or built-in) with an animated result and history. */
export function TableRoller({ entries }: { entries: TableEntry[] }) {
  const [current, setCurrent] = React.useState<HistoryItem | null>(null);
  const [history, setHistory] = React.useState<HistoryItem[]>([]);
  const [rolling, setRolling] = React.useState(false);
  const ranges = entryRanges(entries);
  const formula = tableFormula(entries);

  const roll = () => {
    const result = rollOnTable(entries, createRng());
    if (!result) return;
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      roll: result.roll,
      total: result.total,
      text: result.entry.text,
    };
    setRolling(true);
    setCurrent(item);
    setHistory((h) => [item, ...h].slice(0, 20));
    window.setTimeout(() => setRolling(false), 400);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="lg" onClick={roll} disabled={ranges.length === 0}>
          <Dices className={cn("h-4 w-4", rolling && "animate-dice-roll")} />
          Roll {formula}
        </Button>
        {history.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { setHistory([]); setCurrent(null); }}>
            Clear history
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
          >
            <Card className="border-primary/40">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-display text-2xl font-bold text-primary tabular-nums">
                  {current.roll}
                </div>
                <p className="text-sm">{current.text}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {history.length > 1 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            History
          </p>
          <ul className="space-y-1 text-sm">
            {history.slice(1).map((h) => (
              <li key={h.id} className="flex gap-3 rounded-md border px-3 py-1.5">
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {h.roll}/{h.total}
                </span>
                <span className="flex-1 text-muted-foreground">{h.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
