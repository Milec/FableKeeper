"use client";

import * as React from "react";
import { Copy, RefreshCw, Star, X } from "lucide-react";
import { generateNames, NAME_KINDS, type NameKind } from "@/lib/generators/names";
import { ANCESTRIES } from "@/lib/generators/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<NameKind, string> = {
  person: "Person",
  settlement: "Settlement",
  tavern: "Tavern",
  ship: "Ship",
};

const FAVORITES_KEY = "fablekeeper:favorite-names";
export function NameGenerator() {
  const [kind, setKind] = React.useState<NameKind>("person");
  const [ancestry, setAncestry] = React.useState<string>("any");
  const [count, setCount] = React.useState(8);
  const [results, setResults] = React.useState<string[]>([]);
  const [favorites, setFavorites] = React.useState<string[]>([]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      if (raw) setFavorites(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: string[]) => {
    setFavorites(next);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const generate = React.useCallback(() => {
    setResults(
      generateNames({
        kind,
        ancestry: kind === "person" ? (ancestry as never) : undefined,
        count,
      }),
    );
  }, [kind, ancestry, count]);

  React.useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFavorite = (name: string) => {
    persist(
      favorites.includes(name)
        ? favorites.filter((n) => n !== name)
        : [...favorites, name],
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="kind">Type</Label>
            <Select
              id="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as NameKind)}
            >
              {NAME_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ancestry">Ancestry</Label>
            <Select
              id="ancestry"
              value={ancestry}
              onChange={(e) => setAncestry(e.target.value)}
              disabled={kind !== "person"}
              className={cn(kind !== "person" && "opacity-50")}
            >
              <option value="any">Any</option>
              {ANCESTRIES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="count">How many</Label>
            <Input
              id="count"
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </div>
        </div>

        <Button onClick={generate}>
          <RefreshCw className="h-4 w-4" />
          Generate
        </Button>

        <div className="grid gap-2 sm:grid-cols-2">
          {results.map((name, i) => (
            <Card key={`${name}-${i}`}>
              <CardContent className="flex items-center justify-between gap-2 p-3">
                <span className="truncate font-display">{name}</span>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Copy"
                    onClick={() => navigator.clipboard.writeText(name)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Save favorite"
                    onClick={() => toggleFavorite(name)}
                  >
                    <Star
                      className={cn(
                        "h-3.5 w-3.5",
                        favorites.includes(name) && "fill-primary text-primary",
                      )}
                    />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <aside className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Star className="h-4 w-4 text-primary" />
          Favorites
        </h3>
        {favorites.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Star a name to save it here.
          </p>
        ) : (
          <ul className="space-y-1">
            {favorites.map((name) => (
              <li
                key={name}
                className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
              >
                <span className="truncate">{name}</span>
                <button
                  onClick={() => toggleFavorite(name)}
                  aria-label={`Remove ${name}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
