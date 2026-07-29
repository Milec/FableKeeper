import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Heart, Pencil, Shield, User, Zap } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getCharacter, isCharacterOwner } from "@/lib/characters/queries";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EntryContent } from "@/components/world/entry-content";
import type { AbilityScores, CharacterDefenses } from "@/types/database";

const ABILITIES: { key: keyof AbilityScores; label: string }[] = [
  { key: "str", label: "STR" },
  { key: "dex", label: "DEX" },
  { key: "con", label: "CON" },
  { key: "int", label: "INT" },
  { key: "wis", label: "WIS" },
  { key: "cha", label: "CHA" },
];

function mod(score: number | undefined): string {
  if (typeof score !== "number") return "—";
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
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
  const abilities = (character.abilities as AbilityScores | null) ?? {};
  const defenses = (character.defenses as CharacterDefenses | null) ?? {};
  const data = (character.data as { notes?: string; feats?: string[] } | null) ?? {};
  const base = `/campaigns/${campaignId}/characters`;
  const identity = [character.ancestry, character.heritage, character.background, character.class]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={base}>
          <ArrowLeft className="h-4 w-4" />
          Characters
        </Link>
      </Button>

      <div className="flex flex-wrap items-start gap-5">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border bg-muted">
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
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-bold">{character.name}</h1>
          <p className="text-muted-foreground">{identity || "Adventurer"}</p>
          <Badge variant="secondary" className="mt-2">
            Level {character.level}
          </Badge>
        </div>
        {canEdit && (
          <div className="flex gap-2">
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

      {/* Defenses */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        <StatTile icon={Zap} label="Speed" value={defenses.speed ? `${defenses.speed} ft` : undefined} />
        <StatTile label="Perception" value={defenses.perception} />
      </div>

      {/* Ability scores */}
      <Card>
        <CardContent className="grid grid-cols-3 gap-4 py-4 sm:grid-cols-6">
          {ABILITIES.map(({ key, label }) => (
            <div key={key} className="text-center">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="font-display text-2xl font-bold">{mod(abilities[key])}</p>
              <p className="text-xs text-muted-foreground">{abilities[key] ?? "—"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Feats (from Pathbuilder import or notes) */}
      {Array.isArray(data.feats) && data.feats.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Feats</h2>
          <div className="flex flex-wrap gap-1.5">
            {data.feats.map((feat, i) => (
              <Badge key={`${feat}-${i}`} variant="outline">
                {feat}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {data.notes && data.notes.trim() && (
        <>
          <Separator />
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Notes &amp; journal
            </h2>
            <EntryContent markdown={data.notes} resolver={{ hrefBySlug: {} }} />
          </section>
        </>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | number;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-1 py-4">
        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </div>
        <p className="font-display text-2xl font-bold">{value ?? "—"}</p>
      </CardContent>
    </Card>
  );
}
