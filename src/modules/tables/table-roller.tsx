"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dices, History } from "lucide-react";
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
  index: number;
}

/**
 * Rolls on a table and shows the whole table.
 *
 * Every entry is always visible with its dice range, so you can read the table
 * before (and after) rolling. Rolling animates, then highlights and scrolls to
 * the selected row rather than only reporting a result in isolation.
 */
export function TableRoller({
  entries,
  columns = [],
  dieLabel,
  /** Set false for reference/lookup tables, which are read rather than rolled. */
  rollable = true,
}: {
  entries: TableEntry[];
  columns?: string[];
  dieLabel?: string;
  rollable?: boolean;
}) {
  const [current, setCurrent] = React.useState<HistoryItem | null>(null);
  const [history, setHistory] = React.useState<HistoryItem[]>([]);
  const [rolling, setRolling] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const rowRefs = React.useRef<(HTMLTableRowElement | null)[]>([]);

  const ranges = React.useMemo(() => entryRanges(entries), [entries]);
  const formula = tableFormula(entries);

  const roll = () => {
    const result = rollOnTable(entries, createRng());
    if (!result) return;
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      roll: result.roll,
      total: result.total,
      text: result.entry.text,
      index: result.index,
    };
    setRolling(true);
    setCurrent(item);
    setHistory((h) => [item, ...h].slice(0, 20));
    window.setTimeout(() => setRolling(false), 400);
    // Bring the selected row into view for long tables (e.g. the d100 Quirks).
    window.setTimeout(() => {
      rowRefs.current[result.index]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }, 120);
  };

  return (
    <div className="space-y-3">
      {rollable && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={roll} disabled={ranges.length === 0}>
            <Dices className={cn("h-4 w-4", rolling && "animate-dice-roll")} />
            Roll {dieLabel || formula}
          </Button>
          {history.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory((s) => !s)}
              >
                <History className="h-3.5 w-3.5" />
                {showHistory ? "Hide" : "Show"} history ({history.length})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setHistory([]);
                  setCurrent(null);
                }}
              >
                Clear
              </Button>
            </>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
          >
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-display text-xl font-bold text-primary tabular-nums">
                  {current.roll}
                </div>
                <p className="text-sm">{current.text}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {showHistory && history.length > 1 && (
        <ul className="space-y-1 text-sm">
          {history.slice(1).map((h) => (
            <li key={h.id} className="flex gap-3 rounded-md border px-3 py-1.5">
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {h.roll}/{h.total}
              </span>
              <span className="flex-1 text-muted-foreground">{h.text}</span>
            </li>
          ))}
        </ul>
      )}

      {/* The full table — always visible. */}
      <div className="max-h-96 overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/95 backdrop-blur">
            <tr className="text-left text-muted-foreground">
              <th className="w-20 px-3 py-2 font-medium">{dieLabel || "Roll"}</th>
              <th className="px-3 py-2 font-medium">
                {columns.length > 0 ? columns.join(" · ") : "Result"}
              </th>
            </tr>
          </thead>
          <tbody>
            {ranges.map((r, i) => {
              const selected = current?.index === i;
              return (
                <tr
                  key={i}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  className={cn(
                    "border-t transition-colors",
                    selected && "bg-primary/10",
                  )}
                >
                  <td
                    className={cn(
                      "px-3 py-1.5 font-mono text-xs tabular-nums",
                      selected ? "font-bold text-primary" : "text-muted-foreground",
                    )}
                  >
                    {r.min === r.max ? r.min : `${r.min}–${r.max}`}
                  </td>
                  <td className={cn("px-3 py-1.5", selected && "font-medium")}>
                    {r.text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
