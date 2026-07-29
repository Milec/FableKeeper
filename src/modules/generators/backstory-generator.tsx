"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import {
  generateBackstory,
  backstoryToMarkdown,
  type GeneratedBackstory,
} from "@/lib/generators/backstory";
import { ANCESTRIES, OCCUPATIONS } from "@/lib/generators/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { CopyButton } from "./copy-button";

const AGES = ["any", "young", "adult", "middle-aged", "old"] as const;
export function BackstoryGenerator() {
  const [ancestry, setAncestry] = React.useState("any");
  const [occupation, setOccupation] = React.useState("any");
  const [age, setAge] = React.useState("any");
  const [name, setName] = React.useState("");
  const [result, setResult] = React.useState<GeneratedBackstory | null>(null);

  const generate = React.useCallback(() => {
    setResult(
      generateBackstory({
        ancestry: ancestry as never,
        occupation,
        age: age as never,
        name: name || undefined,
      }),
    );
  }, [ancestry, occupation, age, name]);

  React.useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name (optional)</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Leave blank to roll" />
        </div>
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
          <Label htmlFor="occupation">Occupation</Label>
          <Select id="occupation" value={occupation} onChange={(e) => setOccupation(e.target.value)}>
            <option value="any">Any</option>
            {OCCUPATIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="age">Age</Label>
          <Select id="age" value={age} onChange={(e) => setAge(e.target.value)}>
            {AGES.map((a) => (
              <option key={a} value={a}>{a === "any" ? "Any" : a}</option>
            ))}
          </Select>
        </div>
      </div>

      <Button onClick={generate}>
        <RefreshCw className="h-4 w-4" />
        Generate backstory
      </Button>

      {result && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold">{result.name}</h2>
                <p className="text-muted-foreground">
                  {result.age} {result.ancestry} {result.occupation}
                </p>
              </div>
              <CopyButton text={backstoryToMarkdown(result)} />
            </div>

            <Section title="Summary">{result.summary}</Section>
            <Section title="History">{result.history}</Section>
            <Section title="Future goals">{result.goals}</Section>

            <div>
              <p className="mb-1 text-sm font-semibold">Adventure hooks</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {result.hooks.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
