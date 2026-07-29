import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { getCampaignContext } from "@/lib/world/queries";
import { getCharacter, isCharacterOwner } from "@/lib/characters/queries";
import { deleteCharacter } from "@/lib/characters/actions";
import { CharacterForm } from "@/modules/characters/character-form";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default async function EditCharacterPage({
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
  // Owners of the character, plus campaign Owners/GMs, may edit (mirrors RLS).
  const canEdit =
    owner || campaign.role === "owner" || campaign.role === "game_master";
  if (!canEdit) notFound();

  const base = `/campaigns/${campaignId}/characters/${characterId}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-2xl font-bold">Edit character</h1>
      <CharacterForm
        campaignId={campaignId}
        character={character}
        cancelHref={base}
      />

      <Separator />

      <form action={deleteCharacter}>
        <input type="hidden" name="characterId" value={characterId} />
        <input type="hidden" name="campaignId" value={campaignId} />
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Deleting a character is permanent.
          </p>
          <Button type="submit" variant="destructive" size="sm">
            <Trash2 className="h-4 w-4" />
            Delete character
          </Button>
        </div>
      </form>
    </div>
  );
}
