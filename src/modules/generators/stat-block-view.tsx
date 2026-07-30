"use client";

import type { StatBlock } from "@/lib/generators/statblock";
import { Badge } from "@/components/ui/badge";

const mod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const ABILITY_ORDER = ["str", "dex", "con", "int", "wis", "cha"] as const;

/**
 * Renders a generated NPC stat block in roughly the layout of a printed PF2E
 * stat block, so it can be read at the table.
 */
export function StatBlockView({
  statBlock: sb,
  name,
  traits = [],
}: {
  statBlock: StatBlock;
  name: string;
  traits?: string[];
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
        <p className="font-display text-lg font-bold">{name}</p>
        <Badge>Creature {sb.level}</Badge>
      </div>

      {traits.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {traits.map((t) => (
            <span
              key={t}
              className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <Row label="Perception">{mod(sb.perception)}</Row>
      <Row label="Skills">
        {sb.skills.map((s) => `${s.name} ${mod(s.modifier)}`).join(", ")}
      </Row>

      {/* Ability modifiers */}
      <div className="grid grid-cols-6 gap-1 rounded-md border bg-background p-2 text-center">
        {ABILITY_ORDER.map((k) => (
          <div key={k}>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              {k}
            </p>
            <p className="font-display text-base font-bold tabular-nums">
              {mod(sb.abilities[k])}
            </p>
          </div>
        ))}
      </div>

      {/* Defenses */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="AC" value={sb.ac} />
        <Stat label="HP" value={sb.hp} />
        <Stat label="Fort" value={mod(sb.saves.fort)} />
        <Stat label="Ref" value={mod(sb.saves.ref)} />
        <Stat label="Will" value={mod(sb.saves.will)} />
      </div>

      <Row label="Speed">{sb.speed} feet</Row>

      {/* Strikes */}
      <div className="space-y-1">
        {sb.attacks.map((a, i) => (
          <p key={i} className="text-sm">
            <span className="font-semibold">{a.ranged ? "Ranged" : "Melee"}</span>{" "}
            {a.name} <span className="tabular-nums">{mod(a.bonus)}</span>
            {a.traits.length > 0 && (
              <span className="text-muted-foreground"> ({a.traits.join(", ")})</span>
            )}
            <span className="text-muted-foreground">, </span>
            <span className="font-semibold">Damage</span>{" "}
            <span className="font-mono">{a.damage}</span> {a.damageType}
          </p>
        ))}
      </div>

      {sb.spellcasting && (
        <p className="text-sm">
          <span className="font-semibold capitalize">
            {sb.spellcasting.tradition} Spellcasting
          </span>{" "}
          DC <span className="tabular-nums">{sb.spellcasting.dc}</span>, attack{" "}
          <span className="tabular-nums">{mod(sb.spellcasting.attack)}</span>
        </p>
      )}

      <p className="border-t pt-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{sb.roleLabel}.</span>{" "}
        {sb.note} Numbers are drawn from {sb.sampleSize} published level-
        {sb.level} creatures — adjust freely.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="text-sm">
      <span className="font-semibold">{label}</span>{" "}
      <span className="text-muted-foreground">{children}</span>
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-background px-2 py-1.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-display text-base font-bold tabular-nums">{value}</p>
    </div>
  );
}
