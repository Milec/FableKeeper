"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Dices, RotateCcw, Trash2 } from "lucide-react";
import {
  roll,
  validateFormula,
  formatRollResult,
  type RollResult,
} from "@/lib/dice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const QUICK_DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"] as const;
const PRESETS = ["1d20", "2d6", "4d6kh3", "3d8+4", "2d20kh1", "1d20+5"] as const;

interface HistoryEntry extends RollResult {
  id: string;
}

/**
 * Interactive dice roller built on the FableKeeper dice engine. Demonstrates the
 * module architecture: all rolling logic lives in `@/lib/dice` (pure, tested),
 * while this component is purely presentation + state.
 */
export function DiceRoller() {
  const [formula, setFormula] = React.useState("1d20");
  const [error, setError] = React.useState<string | null>(null);
  const [current, setCurrent] = React.useState<HistoryEntry | null>(null);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [rolling, setRolling] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const doRoll = React.useCallback((raw: string) => {
    const invalid = validateFormula(raw);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    const result = roll(raw);
    const entry: HistoryEntry = {
      ...result,
      id: crypto.randomUUID(),
    };
    setRolling(true);
    setCurrent(entry);
    setHistory((prev) => [entry, ...prev].slice(0, 25));
    window.setTimeout(() => setRolling(false), 500);
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doRoll(formula);
  };

  const copyResult = async () => {
    if (!current) return;
    await navigator.clipboard.writeText(formatRollResult(current));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder="e.g. 4d6kh3+2"
            aria-label="Dice formula"
            className="font-mono"
          />
          <Button type="submit" size="lg" className="shrink-0">
            <Dices className={cn("h-4 w-4", rolling && "animate-dice-roll")} />
            Roll
          </Button>
        </form>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Quick dice */}
        <div className="flex flex-wrap gap-2">
          {QUICK_DICE.map((d) => (
            <Button
              key={d}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setFormula(d);
                doRoll(d);
              }}
            >
              {d}
            </Button>
          ))}
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Badge
              key={p}
              variant="secondary"
              className="cursor-pointer font-mono hover:bg-secondary/70"
              onClick={() => {
                setFormula(p);
                doRoll(p);
              }}
            >
              {p}
            </Badge>
          ))}
        </div>

        {/* Result */}
        <Card className="min-h-[12rem]">
          <CardContent className="flex min-h-[12rem] flex-col items-center justify-center gap-3 p-6">
            <AnimatePresence mode="wait">
              {current ? (
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, scale: 0.8, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="flex flex-col items-center gap-2 text-center"
                >
                  <span className="font-mono text-sm text-muted-foreground">
                    {current.formula}
                  </span>
                  <span className="font-display text-6xl font-bold text-primary tabular-nums">
                    {current.total}
                  </span>
                  <div className="flex flex-wrap justify-center gap-1">
                    {current.terms.map((term, i) =>
                      term.rolls ? (
                        term.rolls.map((r, j) => (
                          <span
                            key={`${i}-${j}`}
                            className={cn(
                              "inline-flex h-7 min-w-7 items-center justify-center rounded border px-1.5 text-xs font-medium tabular-nums",
                              r.dropped
                                ? "border-dashed text-muted-foreground line-through opacity-60"
                                : "border-border bg-secondary",
                            )}
                            title={`d${r.sides}`}
                          >
                            {r.value}
                          </span>
                        ))
                      ) : (
                        <span
                          key={i}
                          className="inline-flex h-7 items-center px-1 text-xs font-medium text-muted-foreground"
                        >
                          {term.label}
                        </span>
                      ),
                    )}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => doRoll(current.formula)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reroll
                    </Button>
                    <Button variant="ghost" size="sm" onClick={copyResult}>
                      <Copy className="h-3.5 w-3.5" />
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Roll some dice to see results here.
                </p>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">History</h3>
          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setHistory([]);
                setCurrent(null);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
        <div className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rolls yet.</p>
          ) : (
            history.map((entry) => (
              <button
                key={entry.id}
                onClick={() => doRoll(entry.formula)}
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {entry.formula}
                </span>
                <span className="font-semibold tabular-nums">{entry.total}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
