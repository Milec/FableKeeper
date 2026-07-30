"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ImageIcon, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ImageUpload } from "@/components/media/image-upload";
import { updateMapImage, type MapImageState } from "@/lib/maps/map-actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      Save image
    </Button>
  );
}

/**
 * Upload the map picture.
 *
 * Azgaar exports its image separately from its JSON, so the pins arrive before
 * the artwork does. Pins are stored as fractions of the image, which means any
 * export resolution lines up without re-importing.
 */
export function MapImageForm({
  campaignId,
  mapId,
  currentUrl,
}: {
  campaignId: string;
  mapId: string;
  currentUrl: string | null;
}) {
  const [state, formAction] = useActionState<MapImageState, FormData>(
    updateMapImage,
    {},
  );

  return (
    // Collapsed once an image exists: the uploader is a large dropzone and would
    // otherwise dominate the header of a map that is already set up.
    <details open={!currentUrl} className="group rounded-lg border bg-card">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
        {currentUrl ? "Change map image" : "Add the map image"}
      </summary>
      <form action={formAction} className="space-y-2 border-t p-3">
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="mapId" value={mapId} />
        <Label className="text-xs">
          Export a PNG from Azgaar at any resolution — pins are stored as
          fractions of the image, so they line up either way.
        </Label>
        <ImageUpload
          campaignId={campaignId}
          kind="maps"
          name="imageUrl"
          defaultValue={currentUrl}
        />
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        <SaveButton />
      </form>
    </details>
  );
}
