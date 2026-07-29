"use client";

import * as React from "react";
import { RefreshCw, Wand2 } from "lucide-react";
import {
  generateNpc,
  npcToMarkdown,
  type GeneratedNpc,
} from "@/lib/generators/npc";
import { ALIGNMENTS, ANCESTRIES, OCCUPATIONS } from "@/lib/generators/data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { CopyButton } from "./copy-button";

export function NpcGenerator() {
  const [ancestry, setAncestry] = React.useState("any");
  const [alignment, setAlignment] = React.useState("any");
  const [occupation, setOccupation] = React.useState("any");
  const [npc, setNpc] = React.useState<GeneratedNpc | null>(null);

  const generate = React.useCallback(() => {
    setNpc(
      generateNpc({
        ancestry: ancestry as never,
        alignment,
        occupation,
      }),
    );
  }, [ancestry, alignment, occupation]);

  React.useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ancestry">Ancestry</Label>
          <Select id="ancestry" value={ancestry} onChange={(e) => setAncestry(e.target.value)}>
            <option value="any">Any</option>
            {ANCESTRIES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="alignment">Alignment</Label>
          <Select id="alignment" value={alignment} onChange={(e) => setAlignment(e.target.value)}>
            <option value="any">Any</option>
            {ALIGNMENTS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="occupation">Occupation</Label>
          <Select id="occupation" value={occupation} onChange={(e) => setOccupation(e.target.value)}>
            <option value="any">Any</option>
            {OCCUPATIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </Select>
        </div>
      </div>

      <Button onClick={generate}>
        <RefreshCw className="h-4 w-4" />
        Generate NPC
      </Button>

      {npc && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold">{npc.name}</h2>
                <p className="text-muted-foreground">
                  {npc.ancestry} {npc.occupation} · {npc.alignment} ·{" "}
                  {npc.level === 0 ? "Ordinary" : `Level ${npc.level}`}
                </p>
              </div>
              <CopyButton text={npcToMarkdown(npc)} />
            </div>

            <p className="text-sm">
              <Wand2 className="mr-1 inline h-3.5 w-3.5 text-primary" />
              {npc.appearance} Speaks with {npc.voice}.
            </p>

            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <Detail label="Personality" value={npc.personality} />
              <Detail label="Ideal" value={npc.ideal} />
              <Detail label="Bond" value={npc.bond} />
              <Detail label="Flaw" value={npc.flaw} />
            </div>

            <div>
              <p className="text-sm font-semibold">Biography</p>
              <p className="text-sm text-muted-foreground">{npc.biography}</p>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold">Plot hooks</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {npc.hooks.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border bg-muted/40 p-3">
              <Badge variant="secondary" className="mb-1">Portrait prompt</Badge>
              <p className="text-xs text-muted-foreground">{npc.portraitPrompt}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-semibold">{label}.</span>{" "}
      <span className="text-muted-foreground">{value}</span>
    </p>
  );
}
