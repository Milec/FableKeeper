"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  abilityModifier,
  formatModifier,
  PROFICIENCY_RANKS,
  RANK_LABELS,
  SAVES,
  SKILLS,
  type AbilityKey,
  type ProficiencyRank,
} from "@/lib/characters/sheet";
import type { AbilityScores } from "@/types/database";

export interface LorePair {
  name: string;
  rank: ProficiencyRank;
}

/**
 * Proficiency rank editor.
 *
 * Ranks previously only arrived via a Pathbuilder import, so a hand-built
 * character could never show a correct skill or save modifier. This lets a GM or
 * player set each rank directly, showing the resulting modifier live so the
 * PF2E maths (level + rank + ability) is visible while editing.
 *
 * Values serialise into hidden JSON inputs, matching how the encounter builder
 * and table editor submit structured state.
 */
export function ProficiencyEditor({
  level,
  abilities,
  keyAbility,
  initialRanks,
  initialLores,
}: {
  level: number;
  abilities: AbilityScores;
  keyAbility: string | null;
  initialRanks: Record<string, ProficiencyRank>;
  initialLores: LorePair[];
}) {
  const [ranks, setRanks] = React.useState<Record<string, ProficiencyRank>>(initialRanks);
  const [lores, setLores] = React.useState<LorePair[]>(initialLores);

  const setRank = (key: string, rank: ProficiencyRank) =>
    setRanks((prev) => ({ ...prev, [key]: rank }));

  /** Live modifier preview: untrained skills get no level bonus in PF2E. */
  const skillModifier = (ability: AbilityKey, rank: ProficiencyRank) =>
    abilityModifier(abilities[ability]) + (rank > 0 ? level + rank : 0);
  const saveModifier = (ability: AbilityKey, rank: ProficiencyRank) =>
    abilityModifier(abilities[ability]) + level + rank;

  const classDcRank = ranks.classDC ?? 0;
  const keyMod =
    keyAbility && keyAbility in abilities
      ? abilityModifier(abilities[keyAbility as AbilityKey])
      : 0;

  const cleanedLores = lores.filter((l) => l.name.trim());

  return (
    <div className="space-y-5">
      <input
        type="hidden"
        name="proficiencies"
        value={JSON.stringify(ranks)}
      />
      <input
        type="hidden"
        name="lores"
        value={JSON.stringify(cleanedLores.map((l) => [l.name.trim(), l.rank]))}
      />

      {/* Saves, Perception, Class DC */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Saves, Perception &amp; Class DC</legend>
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-x-4">
          <RankRow
            label="Perception"
            rank={ranks.perception ?? 0}
            onChange={(r) => setRank("perception", r)}
            preview={formatModifier(saveModifier("wis", ranks.perception ?? 0))}
          />
          {SAVES.map((s) => (
            <RankRow
              key={s.key}
              label={s.label}
              rank={ranks[s.key] ?? 0}
              onChange={(r) => setRank(s.key, r)}
              preview={formatModifier(saveModifier(s.ability, ranks[s.key] ?? 0))}
            />
          ))}
          <RankRow
            label="Class DC"
            rank={classDcRank}
            onChange={(r) => setRank("classDC", r)}
            preview={`DC ${10 + level + classDcRank + keyMod}`}
          />
        </div>
      </fieldset>

      {/* Skills */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Skills</legend>
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-x-4">
          {SKILLS.map((s) => (
            <RankRow
              key={s.key}
              label={s.label}
              hint={s.ability.toUpperCase()}
              rank={ranks[s.key] ?? 0}
              onChange={(r) => setRank(s.key, r)}
              preview={formatModifier(skillModifier(s.ability, ranks[s.key] ?? 0))}
            />
          ))}
        </div>
      </fieldset>

      {/* Lores */}
      <fieldset className="space-y-2">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-medium">Lore skills</legend>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLores((l) => [...l, { name: "", rank: 2 }])}
          >
            <Plus className="h-4 w-4" />
            Add lore
          </Button>
        </div>
        {lores.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No lore skills. Add one for things like Warfare Lore or Absalom Lore.
          </p>
        ) : (
          <div className="space-y-2">
            {lores.map((lore, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  {i === 0 && <Label className="text-xs">Name</Label>}
                  <Input
                    value={lore.name}
                    onChange={(e) =>
                      setLores((l) =>
                        l.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    placeholder="Warfare"
                    aria-label="Lore name"
                  />
                </div>
                <div className="w-36 space-y-1">
                  {i === 0 && <Label className="text-xs">Rank</Label>}
                  <Select
                    value={String(lore.rank)}
                    aria-label="Lore rank"
                    onChange={(e) =>
                      setLores((l) =>
                        l.map((x, idx) =>
                          idx === i
                            ? { ...x, rank: Number(e.target.value) as ProficiencyRank }
                            : x,
                        ),
                      )
                    }
                  >
                    {PROFICIENCY_RANKS.map((r) => (
                      <option key={r} value={r}>
                        {RANK_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </div>
                <span className="w-10 pb-2 text-right text-sm tabular-nums text-muted-foreground">
                  {formatModifier(skillModifier("int", lore.rank))}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove lore"
                  onClick={() => setLores((l) => l.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}

function RankRow({
  label,
  hint,
  rank,
  onChange,
  preview,
}: {
  label: string;
  hint?: string;
  rank: ProficiencyRank;
  onChange: (rank: ProficiencyRank) => void;
  preview: string;
}) {
  return (
    // Bordered so each label / rank / modifier trio reads as one row: in a
    // two-column grid a bare modifier sits right next to the next label.
    <div className="flex items-center gap-2 rounded-md border bg-card/40 py-1 pl-2.5 pr-1">
      <span className="min-w-0 flex-1 truncate text-sm">
        {label}
        {hint && (
          <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      <div className="w-32 shrink-0">
        <Select
          value={String(rank)}
          aria-label={`${label} proficiency`}
          onChange={(e) => onChange(Number(e.target.value) as ProficiencyRank)}
        >
          {PROFICIENCY_RANKS.map((r) => (
            <option key={r} value={r}>
              {RANK_LABELS[r]}
            </option>
          ))}
        </Select>
      </div>
      <span
        className={`shrink-0 text-right text-sm font-semibold tabular-nums ${
          preview.startsWith("DC") ? "w-14" : "w-10"
        } ${rank > 0 ? "" : "text-muted-foreground"}`}
      >
        {preview}
      </span>
    </div>
  );
}
