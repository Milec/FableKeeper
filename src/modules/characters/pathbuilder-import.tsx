"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  importPathbuilderCharacter,
  type CharacterActionState,
} from "@/lib/characters/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      Import character
    </Button>
  );
}

export function PathbuilderImport({ campaignId }: { campaignId: string }) {
  const [state, formAction] = useActionState<CharacterActionState, FormData>(
    importPathbuilderCharacter,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">How to import</p>
        <ol className="ml-4 mt-1 list-decimal space-y-0.5">
          <li>In Pathbuilder 2e, open your character.</li>
          <li>
            Use <span className="font-medium">Menu → Export → Export to JSON</span>{" "}
            (or copy the JSON from <code className="font-mono">json.php</code>).
          </li>
          <li>Paste the JSON below.</li>
        </ol>
      </div>
      <div className="space-y-2">
        <Label htmlFor="json">Pathbuilder JSON</Label>
        <Textarea
          id="json"
          name="json"
          required
          placeholder='{"success":true,"build":{ … }}'
          className="min-h-[16rem] font-mono text-xs"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
