"use client";

import * as React from "react";
import Image from "next/image";
import { ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  /** Campaign id — used as the storage path prefix that RLS checks. */
  campaignId: string;
  /** Logical folder within the campaign, e.g. "characters" or "handouts". */
  kind: string;
  /** Hidden form field name that receives the uploaded public URL. */
  name: string;
  /** Existing image URL (when editing). */
  defaultValue?: string | null;
  className?: string;
}

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, matches the bucket limit.

/**
 * Uploads an image to the campaign's `media` bucket in Supabase Storage and
 * stores the resulting public URL in a hidden input so it submits with the
 * surrounding form. Storage RLS restricts writes to campaign members; the file
 * path is always `{campaignId}/{kind}/{uuid}.{ext}` so the policy can authorize
 * by campaign.
 */
export function ImageUpload({
  campaignId,
  kind,
  name,
  defaultValue,
  className,
}: ImageUploadProps) {
  const [url, setUrl] = React.useState<string | null>(defaultValue ?? null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("Image must be 10 MB or smaller.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${campaignId}/${kind}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from("media").getPublicUrl(path);
      setUrl(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <input type="hidden" name={name} value={url ?? ""} />
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={onSelect}
      />
      {url ? (
        <div className="relative h-40 w-40 overflow-hidden rounded-lg border">
          <Image src={url} alt="" fill sizes="160px" className="object-cover" />
          <button
            type="button"
            onClick={() => setUrl(null)}
            aria-label="Remove image"
            className="absolute right-1 top-1 rounded-full bg-background/80 p-1 hover:bg-background"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <ImagePlus className="h-6 w-6" />
          )}
          <span>{uploading ? "Uploading…" : "Upload image"}</span>
        </button>
      )}
      {url && !uploading && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          Replace
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
