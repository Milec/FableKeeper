"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createCampaign, type CreateCampaignState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      Create campaign
    </Button>
  );
}

/**
 * Inline campaign creation form. Kept as a lightweight expandable panel rather
 * than a modal so the dashboard works without extra dialog primitives; can be
 * swapped for a Dialog later without touching the server action.
 */
export function CreateCampaignForm() {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState<CreateCampaignState, FormData>(
    createCampaign,
    {},
  );
  const formRef = React.useRef<HTMLFormElement>(null);

  // Collapse the form after a successful submit (no error and form was reset).
  React.useEffect(() => {
    if (state && !state.error && open) {
      // noop; kept for future toast integration
    }
  }, [state, open]);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New campaign
      </Button>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="font-display text-lg">New campaign</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Campaign name</Label>
            <Input id="name" name="name" placeholder="The Fall of Absalom" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              name="description"
              placeholder="A city under siege…"
            />
          </div>
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <div className="flex gap-2">
            <SubmitButton />
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
