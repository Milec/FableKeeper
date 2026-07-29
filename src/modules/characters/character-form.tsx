"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUpload } from "@/components/media/image-upload";
import { MarkdownField } from "@/components/markdown-field";
import {
  createCharacter,
  updateCharacter,
  type CharacterActionState,
} from "@/lib/characters/actions";
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
  const notes =
    (character?.data as { notes?: string } | null)?.notes ?? "";

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="campaignId" value={campaignId} />
      {character && (
        <input type="hidden" name="characterId" value={character.id} />
      )}

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
                defaultValue={character?.level ?? 1}
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
                defaultValue={abilities[key] ?? 10}
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

      <div className="space-y-2">
        <Label>Notes &amp; journal</Label>
        <MarkdownField
          name="notes"
          defaultValue={notes}
          placeholder="Backstory, goals, session notes…"
        />
      </div>

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
