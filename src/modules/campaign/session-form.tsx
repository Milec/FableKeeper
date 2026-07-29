"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownField } from "@/components/markdown-field";
import {
  createSession,
  updateSession,
  type CampaignActionState,
} from "@/lib/campaign/actions";
import { contentMarkdown } from "@/lib/campaign/content";
import type { Session } from "@/types/database";

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {editing ? "Save session" : "Create session"}
    </Button>
  );
}

export function SessionForm({
  campaignId,
  session,
  cancelHref,
}: {
  campaignId: string;
  session?: Session;
  cancelHref: string;
}) {
  const editing = Boolean(session);
  const action = editing ? updateSession : createSession;
  const [state, formAction] = useActionState<CampaignActionState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="campaignId" value={campaignId} />
      {session && <input type="hidden" name="sessionId" value={session.id} />}

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={session?.title}
            placeholder="Session 12: The Sunken Temple"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sessionDate">Date</Label>
          <Input
            id="sessionDate"
            name="sessionDate"
            type="date"
            defaultValue={session?.session_date ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <MarkdownField
          name="markdown"
          defaultValue={contentMarkdown(session?.content)}
          placeholder="What happened this session…"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isSecret"
          defaultChecked={session?.is_secret ?? false}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        <span>
          GM only <span className="text-muted-foreground">— hide from players (planning notes)</span>
        </span>
      </label>

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
