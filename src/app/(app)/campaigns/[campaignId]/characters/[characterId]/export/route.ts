import { NextResponse } from "next/server";
import { getCharacter } from "@/lib/characters/queries";
import { slugify } from "@/lib/utils";

/**
 * Export a character as JSON. RLS on the underlying query ensures only users who
 * may see the character can download it.
 */
export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ campaignId: string; characterId: string }> },
) {
  const { campaignId, characterId } = await params;
  const character = await getCharacter(characterId);
  if (!character || character.campaign_id !== campaignId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const payload = {
    fablekeeper: { version: 1, kind: "character" },
    character: {
      name: character.name,
      ancestry: character.ancestry,
      heritage: character.heritage,
      background: character.background,
      class: character.class,
      level: character.level,
      key_ability: character.key_ability,
      abilities: character.abilities,
      defenses: character.defenses,
      data: character.data,
    },
  };

  const filename = `${slugify(character.name) || "character"}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
