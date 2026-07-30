"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageUpload } from "@/components/media/image-upload";
import { MarkdownField } from "@/components/markdown-field";
import {
  createCharacter,
  updateCharacter,
  type CharacterActionState,
} from "@/lib/characters/actions";
import {
  characterData,
  deriveCoins,
  deriveConditions,
  deriveEquipment,
  deriveFeats,
  deriveHeroPoints,
  deriveLanguages,
  deriveLorePairs,
  deriveProficiencies,
  deriveProgression,
  XP_PER_LEVEL,
} from "@/lib/characters/sheet";
import { ProficiencyEditor } from "./proficiency-editor";
import { InventoryEditor, TextListEditor } from "./list-editors";
import type {
  AbilityScores,
  Character,
  CharacterDefenses,
} from "@/types/database";

const ABILITIES: { key: keyof AbilityScores; label: string }[] = [
  { key: "str", label: "STR" },
  { key: "dex", label: "DEX" },
  { key: "con", label: "CON" },
  { key: "int", label: "INT" },
  { key: "wis", label: "WIS" },
  { key: "cha", label: "CHA" },
];

const COINS = [
  { key: "pp" as const, label: "PP" },
  { key: "gp" as const, label: "GP" },
  { key: "sp" as const, label: "SP" },
  { key: "cp" as const, label: "CP" },
];

const DEFENSES: { key: keyof CharacterDefenses; label: string }[] = [
  { key: "ac", label: "AC" },
  { key: "hp_max", label: "Max HP" },
  { key: "hp_current", label: "Current HP" },
  { key: "speed", label: "Speed" },
];

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {editing ? "Save changes" : "Create character"}
    </Button>
  );
}

export function CharacterForm({
  campaignId,
  character,
  cancelHref,
}: {
  campaignId: string;
  character?: Character;
  cancelHref: string;
}) {
  const editing = Boolean(character);
  const action = editing ? updateCharacter : createCharacter;
  const [state, formAction] = useActionState<CharacterActionState, FormData>(
    action,
    {},
  );

  const abilities = (character?.abilities as AbilityScores | null) ?? {};
  const defenses = (character?.defenses as CharacterDefenses | null) ?? {};
  const data = characterData(character ?? ({ data: {} } as never));
  const notes = data.notes ?? "";
  const coins = deriveCoins(data);
  const languages = deriveLanguages(data);
  const conditions = deriveConditions(data);
  const feats = deriveFeats(data);
  const equipment = deriveEquipment(data);
  const progression = deriveProgression(data);
  const heroPoints = deriveHeroPoints(data);

  // The proficiency editor previews modifiers live, so it needs the current
  // level and ability scores as they are being edited.
  const [level, setLevel] = React.useState(character?.level ?? 1);
  const [liveAbilities, setLiveAbilities] = React.useState<AbilityScores>(abilities);
  const [keyAbility, setKeyAbility] = React.useState(character?.key_ability ?? "");

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="campaignId" value={campaignId} />
      {character && (
        <input type="hidden" name="characterId" value={character.id} />
      )}

      <Tabs defaultValue="identity">
        <TabsList className="flex-wrap">
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="stats">Abilities</TabsTrigger>
          <TabsTrigger value="proficiencies">Proficiencies</TabsTrigger>
          <TabsTrigger value="gear">Feats &amp; Gear</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        {/*
          forceMount keeps every panel in the DOM. Radix unmounts inactive tabs
          by default, which would drop those inputs from the submitted FormData.
        */}
        <TabsContent
          value="identity"
          forceMount
          className="space-y-5 pt-4 data-[state=inactive]:hidden"
        >
          <div className="grid gap-6 sm:grid-cols-[10rem_1fr]">
            <div>
              <Label className="mb-2 block">Portrait</Label>
              <ImageUpload
                campaignId={campaignId}
                kind="characters"
                name="portraitUrl"
                defaultValue={character?.portrait_url}
              />
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" defaultValue={character?.name} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="characterClass">Class</Label>
                  <Input
                    id="characterClass"
                    name="characterClass"
                    defaultValue={character?.class ?? ""}
                    placeholder="Fighter"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="level">Level</Label>
                  <Input
                    id="level"
                    name="level"
                    type="number"
                    min={1}
                    max={20}
                    value={level}
                    onChange={(e) => setLevel(Number(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ancestry">Ancestry</Label>
                  <Input
                    id="ancestry"
                    name="ancestry"
                    defaultValue={character?.ancestry ?? ""}
                    placeholder="Human"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="heritage">Heritage</Label>
                  <Input
                    id="heritage"
                    name="heritage"
                    defaultValue={character?.heritage ?? ""}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="background">Background</Label>
                  <Input
                    id="background"
                    name="background"
                    defaultValue={character?.background ?? ""}
                    placeholder="Acolyte"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="keyAbility">Key ability</Label>
              <Select
                id="keyAbility"
                name="keyAbility"
                value={keyAbility}
                onChange={(e) => setKeyAbility(e.target.value)}
              >
                <option value="">None</option>
                {ABILITIES.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deity">Deity</Label>
              <Input
                id="deity"
                name="deity"
                defaultValue={data.deity ?? ""}
                placeholder="Iomedae"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="xp">XP toward next level</Label>
              <Input
                id="xp"
                name="xp"
                type="number"
                min={0}
                max={XP_PER_LEVEL}
                defaultValue={progression.xp || ""}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="heroPoints">Hero points</Label>
              <Input
                id="heroPoints"
                name="heroPoints"
                type="number"
                min={0}
                max={3}
                defaultValue={heroPoints}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="stats"
          forceMount
          className="space-y-5 pt-4 data-[state=inactive]:hidden"
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Ability scores</legend>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {ABILITIES.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`ability_${key}`} className="text-xs">
                    {label}
                  </Label>
                  <Input
                    id={`ability_${key}`}
                    name={`ability_${key}`}
                    type="number"
                    min={1}
                    max={30}
                    value={liveAbilities[key] ?? 10}
                    onChange={(e) =>
                      setLiveAbilities((prev) => ({
                        ...prev,
                        [key]: Number(e.target.value) || 10,
                      }))
                    }
                    className="text-center"
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Defenses</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {DEFENSES.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`def_${key}`} className="text-xs">
                    {label}
                  </Label>
                  <Input
                    id={`def_${key}`}
                    name={`def_${key}`}
                    type="number"
                    defaultValue={defenses[key] ?? ""}
                    className="text-center"
                  />
                </div>
              ))}
            </div>
          </fieldset>
        </TabsContent>

        <TabsContent
          value="proficiencies"
          forceMount
          className="pt-4 data-[state=inactive]:hidden"
        >
          <p className="mb-4 text-xs text-muted-foreground">
            Modifiers update as you go: level + proficiency rank + ability
            modifier. Untrained skills get no level bonus.
          </p>
          <ProficiencyEditor
            level={level}
            abilities={liveAbilities}
            keyAbility={keyAbility || null}
            initialRanks={deriveProficiencies(data)}
            initialLores={deriveLorePairs(data)}
          />
        </TabsContent>

        <TabsContent
          value="gear"
          forceMount
          className="space-y-5 pt-4 data-[state=inactive]:hidden"
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Feats &amp; abilities</legend>
            <TextListEditor
              name="feats"
              initial={feats}
              placeholder="Power Attack"
              addLabel="Add feat"
              emptyHint="No feats recorded yet."
            />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Inventory</legend>
            <InventoryEditor name="equipment" initial={equipment} />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Wealth</legend>
            <div className="grid grid-cols-4 gap-3">
              {COINS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`coin_${key}`} className="text-xs">
                    {label}
                  </Label>
                  <Input
                    id={`coin_${key}`}
                    name={`coin_${key}`}
                    type="number"
                    min={0}
                    defaultValue={coins[key] || ""}
                    className="text-center"
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="languages">Languages</Label>
              <Input
                id="languages"
                name="languages"
                defaultValue={languages.join(", ")}
                placeholder="Common, Elven"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conditions">Conditions</Label>
              <Input
                id="conditions"
                name="conditions"
                defaultValue={conditions.join(", ")}
                placeholder="Frightened 1, Clumsy 1"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="notes"
          forceMount
          className="space-y-2 pt-4 data-[state=inactive]:hidden"
        >
          <Label>Notes &amp; journal</Label>
          <MarkdownField
            name="notes"
            defaultValue={notes}
            placeholder="Backstory, goals, session notes…"
          />
        </TabsContent>
      </Tabs>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <SubmitButton editing={editing} />
        <Button type="button" variant="ghost" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
