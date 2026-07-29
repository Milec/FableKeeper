"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { importRollTable, type TableActionState } from "@/lib/tables/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      Import table
    </Button>
  );
}

export function TableImport({ campaignId }: { campaignId: string }) {
  const [state, formAction] = useActionState<TableActionState, FormData>(
    importRollTable,
    {},
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="space-y-2">
        <Label htmlFor="json">Table JSON</Label>
        <Textarea
          id="json"
          name="json"
          required
          placeholder='{"fablekeeper":{"version":1,"kind":"roll_table"},"name":"…","entries":[…]}'
          className="min-h-[14rem] font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Paste a table exported from FableKeeper (or any JSON with a{" "}
          <code className="font-mono">name</code> and an{" "}
          <code className="font-mono">entries</code> array).
        </p>
      </div>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
