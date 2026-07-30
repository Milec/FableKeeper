import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Coins,
  Download,
  Heart,
  Languages,
  Package,
  Pencil,
  Shield,
  Sparkles,
  Star,
  Swords,
  Target,
  User,
  Zap,
} from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getCharacter, isCharacterOwner } from "@/lib/characters/queries";
import {
  deriveSheet,
  formatModifier,
  RANK_LABELS,
  type DerivedStat,
} from "@/lib/characters/sheet";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EntryContent } from "@/components/world/entry-content";
import type { AbilityScores } from "@/types/database";

const ABILITY_ORDER: { key: keyof AbilityScores; label: string }[] = [
  { key: "str", label: "STR" },
  { key: "dex", label: "DEX" },
  { key: "con", label: "CON" },
  { key: "int", label: "INT" },
  { key: "wis", label: "WIS" },
  { key: "cha", label: "CHA" },
];

function abilityMod(score: number | undefined): string {
  if (typeof score !== "number") return "—";
  return formatModifier(Math.floor((score - 10) / 2));
}

export default async function CharacterSheetPage({
  params,
}: {
  params: Promise<{ campaignId: string; characterId: string }>;
}) {
  const { campaignId, characterId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  const character = await getCharacter(characterId);
  if (!character || character.campaign_id !== campaignId) notFound();

  const owner = await isCharacterOwner(character);
  const canEdit = owner || can(campaign.role, "character:view_all");
  const sheet = deriveSheet(character);
  const { abilities, defenses } = sheet;
  const base = `/campaigns/${campaignId}/characters`;
  const identity = [
    character.ancestry,
    character.heritage,
    character.background,
    character.class,
  ]
    .filter(Boolean)
    .join(" · ");

  const trainedSkills = sheet.skills.filter((s) => s.rank > 0);
  const untrainedSkills = sheet.skills.filter((s) => s.rank === 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={base}>
          <ArrowLeft className="h-4 w-4" />
          Characters
        </Link>
      </Button>

      {/* Identity */}
      <div className="flex flex-wrap items-start gap-4 sm:gap-5">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border bg-muted sm:h-28 sm:w-28">
          {character.portrait_url ? (
            <Image
              src={character.portrait_url}
              alt=""
              fill
              sizes="112px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <User className="h-10 w-10 text-muted-foreground" />
            </div>
          )}
        </div>
        {/*
          A hard min-width keeps this block from collapsing to near-zero on a
          phone, which squeezed the name into one word per line and pushed the
          action buttons over it instead of wrapping them below.
        */}
        <div className="min-w-[12rem] flex-1">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {character.name}
          </h1>
          <p className="text-muted-foreground">{identity || "Adventurer"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary">Level {sheet.level}</Badge>
            {character.key_ability && (
              <Badge variant="outline" className="uppercase">
                Key: {character.key_ability}
              </Badge>
            )}
            {sheet.classDc !== null && (
              <Badge variant="outline">Class DC {sheet.classDc}</Badge>
            )}
            {sheet.deity && <Badge variant="outline">{sheet.deity}</Badge>}
            {sheet.alignment && (
              <Badge variant="outline">{sheet.alignment}</Badge>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" size="sm" asChild>
              <a href={`${base}/${characterId}/export`} download>
                <Download className="h-4 w-4" />
                Export
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`${base}/${characterId}/edit`}>
                <Pencil className="h-4 w-4" />
                Edit
              </Link>
            </Button>
          </div>
        )}
      </div>

      {/* Progression & hero points */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Card>
          <CardContent className="py-3">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                Experience
              </span>
              <span className="tabular-nums text-muted-foreground">
                {sheet.progression.xp} / {sheet.progression.xpPerLevel} XP to
                level {Math.min(20, sheet.level + 1)}
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={sheet.progression.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Experience toward next level"
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${sheet.progression.percent}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col justify-center gap-1.5 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hero points
            </span>
            <div className="flex gap-1.5" aria-label={`${sheet.heroPoints} of 3 hero points`}>
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  aria-hidden
                  className={`h-4 w-4 rounded-full border-2 ${
                    n <= sheet.heroPoints
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/40"
                  }`}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conditions */}
      {sheet.conditions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <span className="text-sm font-semibold">Conditions</span>
          {sheet.conditions.map((c) => (
            <Badge key={c} variant="destructive">
              {c}
            </Badge>
          ))}
        </div>
      )}

      {/* Core defenses */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile icon={Shield} label="AC" value={defenses.ac} />
        <StatTile
          icon={Heart}
          label="HP"
          value={
            defenses.hp_max
              ? `${defenses.hp_current ?? defenses.hp_max}/${defenses.hp_max}`
              : undefined
          }
        />
        <StatTile
          icon={Target}
          label="Perception"
          value={formatModifier(sheet.perception.modifier)}
          hint={RANK_LABELS[sheet.perception.rank]}
        />
        {sheet.saves.map((s) => (
          <StatTile
            key={s.key}
            label={s.label}
            value={formatModifier(s.modifier)}
            hint={RANK_LABELS[s.rank]}
          />
        ))}
      </div>

      {/* Ability scores */}
      <Card>
        <CardContent className="grid grid-cols-3 gap-4 py-4 sm:grid-cols-6">
          {ABILITY_ORDER.map(({ key, label }) => (
            <div key={key} className="text-center">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="font-display text-2xl font-bold tabular-nums">
                {abilityMod(abilities[key])}
              </p>
              <p className="text-xs text-muted-foreground">
                {abilities[key] ?? "—"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Skills */}
      <Section icon={Star} title="Skills">
        {trainedSkills.length === 0 && sheet.lores.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No trained skills recorded. Import from Pathbuilder or set proficiencies
            when editing.
          </p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {[...trainedSkills, ...sheet.lores].map((s) => (
              <SkillRow key={s.key} stat={s} />
            ))}
          </div>
        )}
        {untrainedSkills.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Show {untrainedSkills.length} untrained skills
            </summary>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {untrainedSkills.map((s) => (
                <SkillRow key={s.key} stat={s} muted />
              ))}
            </div>
          </details>
        )}
      </Section>

      {/* Spellcasting */}
      {sheet.spellcasting.length > 0 && (
        <Section icon={Sparkles} title="Spellcasting">
          <div className="space-y-4">
            {sheet.spellcasting.map((sc, i) => (
              <div key={i} className="space-y-2">
                <p className="text-sm font-medium">
                  {sc.name}
                  {sc.tradition && (
                    <span className="ml-2 text-xs capitalize text-muted-foreground">
                      {sc.tradition}
                      {sc.ability && ` · ${sc.ability.toUpperCase()}`}
                    </span>
                  )}
                </p>
                {sc.spellsByRank.map((g) => (
                  <div key={g.rank}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.rank}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {g.spells.map((s, j) => (
                        <Badge key={`${s}-${j}`} variant="outline" className="capitalize">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Feats */}
      {sheet.feats.length > 0 && (
        <Section icon={Swords} title={`Feats (${sheet.feats.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {sheet.feats.map((f, i) => (
              <Badge key={`${f}-${i}`} variant="outline">
                {f}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* Inventory & wealth */}
      {(sheet.equipment.length > 0 ||
        Object.values(sheet.coins).some((v) => v > 0)) && (
        <Section icon={Package} title="Inventory">
          {Object.values(sheet.coins).some((v) => v > 0) && (
            <p className="mb-3 flex items-center gap-2 text-sm">
              <Coins className="h-4 w-4 text-muted-foreground" />
              <span className="tabular-nums">
                {sheet.coins.pp > 0 && `${sheet.coins.pp} pp `}
                {sheet.coins.gp > 0 && `${sheet.coins.gp} gp `}
                {sheet.coins.sp > 0 && `${sheet.coins.sp} sp `}
                {sheet.coins.cp > 0 && `${sheet.coins.cp} cp`}
              </span>
            </p>
          )}
          {sheet.equipment.length > 0 && (
            <ul className="grid gap-1 sm:grid-cols-2">
              {sheet.equipment.map((item, i) => (
                <li
                  key={`${item.name}-${i}`}
                  className="flex items-center justify-between rounded border px-2.5 py-1 text-sm"
                >
                  <span className="truncate">{item.name}</span>
                  {item.quantity > 1 && (
                    <span className="text-xs text-muted-foreground">
                      ×{item.quantity}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* Languages & speed */}
      <div className="grid gap-3 sm:grid-cols-2">
        {sheet.languages.length > 0 && (
          <Card>
            <CardContent className="flex items-start gap-2 py-3">
              <Languages className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Languages
                </p>
                <p className="text-sm">{sheet.languages.join(", ")}</p>
              </div>
            </CardContent>
          </Card>
        )}
        {defenses.speed && (
          <Card>
            <CardContent className="flex items-start gap-2 py-3">
              <Zap className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Speed
                </p>
                <p className="text-sm">{defenses.speed} feet</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Journal */}
      {sheet.notes.trim() && (
        <>
          <Separator />
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Notes &amp; journal
            </h2>
            <EntryContent markdown={sheet.notes} resolver={{ hrefBySlug: {} }} />
          </section>
        </>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Icon className="h-4.5 w-4.5 text-primary" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function SkillRow({ stat, muted }: { stat: DerivedStat; muted?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded border px-2.5 py-1 text-sm ${
        muted ? "text-muted-foreground" : ""
      }`}
    >
      <span className="truncate">
        {stat.label}
        {stat.rank > 0 && (
          <span className="ml-1.5 text-xs text-muted-foreground">
            {RANK_LABELS[stat.rank]}
          </span>
        )}
      </span>
      <span className="font-medium tabular-nums">
        {formatModifier(stat.modifier)}
      </span>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-0.5 py-3">
        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </div>
        <p className="font-display text-xl font-bold tabular-nums">
          {value ?? "—"}
        </p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
