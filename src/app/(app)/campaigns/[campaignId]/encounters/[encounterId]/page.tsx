import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getEncounter, encounterCombatants } from "@/lib/encounters/queries";
import { can } from "@/lib/permissions";
import {
  combatantXp,
  summarize,
  THREAT_LABELS,
  effectiveLevel,
  type Threat,
} from "@/lib/encounters/budget";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const KIND_LABEL: Record<string, string> = {
  creature: "Creature",
  simple_hazard: "Simple hazard",
  complex_hazard: "Complex hazard",
};

export default async function EncounterPage({
  params,
}: {
  params: Promise<{ campaignId: string; encounterId: string }>;
}) {
  const { campaignId, encounterId } = await params;
  const campaign = await getCampaignContext(campaignId);
  if (!campaign) notFound();
  const encounter = await getEncounter(encounterId);
  if (!encounter || encounter.campaign_id !== campaignId) notFound();

  const combatants = encounterCombatants(encounter);
  const threat = (encounter.target_threat as Threat) ?? "moderate";
  const summary = summarize(combatants, encounter.party_size, encounter.party_level, threat);
  const canEdit = can(campaign.role, "session:edit");
  const base = `/campaigns/${campaignId}/encounters`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={base}>
          <ArrowLeft className="h-4 w-4" />
          Encounters
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{encounter.name}</h1>
          <p className="text-muted-foreground">
            Party of {encounter.party_size} · Level {encounter.party_level} · target{" "}
            {THREAT_LABELS[threat]}
          </p>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`${base}/${encounterId}/edit`}>
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 py-4">
          <Stat label="Total XP" value={summary.totalXp} />
          <Stat label="Budget" value={summary.budget} muted />
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Threat</p>
            <p className="font-display text-2xl font-bold">{THREAT_LABELS[summary.rating]}</p>
          </div>
        </CardContent>
      </Card>

      {combatants.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Level</th>
                <th className="px-4 py-2 font-medium">Count</th>
                <th className="px-4 py-2 text-right font-medium">XP</th>
              </tr>
            </thead>
            <tbody>
              {combatants.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-4 py-2">{c.name || "—"}</td>
                  <td className="px-4 py-2">
                    {KIND_LABEL[c.kind] ?? c.kind}
                    {c.adjustment !== "none" && (
                      <Badge variant="outline" className="ml-2">{c.adjustment}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {effectiveLevel(c)}
                    {c.adjustment !== "none" && (
                      <span className="text-muted-foreground"> (from {c.level})</span>
                    )}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{c.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {combatantXp(c, encounter.party_level)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {encounter.notes && (
        <p className="text-sm text-muted-foreground">{encounter.notes}</p>
      )}
    </div>
  );
}

function Stat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-display text-2xl font-bold tabular-nums ${muted ? "text-muted-foreground" : ""}`}>
        {value}
      </p>
    </div>
  );
}
