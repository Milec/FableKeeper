"use client";

import * as React from "react";
import Link from "next/link";
import {
  Crown,
  Eye,
  EyeOff,
  Home,
  ImageOff,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  Search,
  Skull,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { setAllPinsRevealed, setPinRevealed } from "@/lib/maps/pin-actions";
import type { MapPin } from "@/types/database";

const MIN_ZOOM = 1;
const MAX_ZOOM = 12;

/** Pin styling by kind, so a capital reads differently from a ruin at a glance. */
const PIN_STYLES: Record<string, { colour: string; dot: number; icon?: typeof Crown }> = {
  city: { colour: "bg-amber-400 border-amber-200", dot: 9, icon: Crown },
  town: { colour: "bg-sky-400 border-sky-200", dot: 7 },
  village: { colour: "bg-emerald-400 border-emerald-200", dot: 5 },
  dungeon: { colour: "bg-rose-500 border-rose-300", dot: 7, icon: Skull },
  ruin: { colour: "bg-stone-400 border-stone-200", dot: 6 },
  landmark: { colour: "bg-violet-400 border-violet-200", dot: 6 },
};

function styleFor(kind: string) {
  return PIN_STYLES[kind] ?? PIN_STYLES.landmark!;
}

export interface ViewerPin extends Pick<MapPin, "id" | "label" | "kind" | "x" | "y" | "is_revealed"> {
  /** Resolved article href, when the pin has an entry. */
  href: string | null;
}

export function MapViewer({
  mapId,
  mapName,
  imageUrl,
  pins,
  canReveal,
}: {
  mapId: string;
  mapName: string;
  imageUrl: string | null;
  pins: ViewerPin[];
  canReveal: boolean;
}) {
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState<string | null>(null);
  const [hiddenShown, setHiddenShown] = React.useState(true);
  // Reveal state is optimistic: the toggle should feel instant, and the server
  // action reconciles on the next load.
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>({});
  // Pins are positioned as percentages of the frame, so the frame has to match
  // the image's aspect ratio exactly — otherwise object-contain letterboxes the
  // image inside it and every pin drifts. Measured from the image once it loads.
  const [aspect, setAspect] = React.useState<number | null>(null);
  const [bulkPending, setBulkPending] = React.useState(false);
  const [bulkError, setBulkError] = React.useState<string | null>(null);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const isRevealed = (pin: ViewerPin) => revealed[pin.id] ?? pin.is_revealed;

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(
      pins.filter((p) => p.label.toLowerCase().includes(q)).map((p) => p.id),
    );
  }, [pins, query]);

  const visible = pins.filter((p) => hiddenShown || isRevealed(p));

  function clampOffset(next: { x: number; y: number }, z: number) {
    const frame = frameRef.current;
    if (!frame) return next;
    // At zoom z the content is z× the frame, so it can travel (z-1)/2 of the
    // frame in each direction before an edge pulls into view.
    const maxX = (frame.clientWidth * (z - 1)) / 2;
    const maxY = (frame.clientHeight * (z - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  }

  const zoomBy = (factor: number) =>
    setZoom((z) => {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor));
      setOffset((o) => clampOffset(o, next));
      return next;
    });

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  function onPointerDown(e: React.PointerEvent) {
    if (zoom === 1) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    setOffset(clampOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }, zoom));
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function toggleReveal(pin: ViewerPin) {
    const next = !isRevealed(pin);
    setRevealed((prev) => ({ ...prev, [pin.id]: next }));
    try {
      await setPinRevealed(pin.id, next);
    } catch {
      setRevealed((prev) => ({ ...prev, [pin.id]: !next }));
    }
  }

  const hiddenCount = pins.filter((p) => !isRevealed(p)).length;

  /**
   * Lift or drop the fog over the whole map at once.
   *
   * A GM starting a campaign wants everything hidden and reveals as the party
   * travels; one importing a map their players already know wants the opposite.
   * Doing either a pin at a time across several hundred pins is not a workflow.
   */
  async function revealAll(next: boolean) {
    setBulkPending(true);
    setBulkError(null);
    setRevealed(Object.fromEntries(pins.map((p) => [p.id, next])));
    try {
      await setAllPinsRevealed(mapId, next);
    } catch {
      // Clearing the overrides falls every pin back to the server's own value,
      // which is still what it was before this attempt.
      setRevealed({});
      setBulkError(
        `Could not ${next ? "reveal" : "hide"} every location. Nothing was changed.`,
      );
    } finally {
      setBulkPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Find a place on ${mapName}…`}
            className="pl-8"
            aria-label="Find a place"
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 1.4)}
            disabled={zoom <= MIN_ZOOM}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {zoom.toFixed(1)}×
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Zoom in"
            onClick={() => zoomBy(1.4)}
            disabled={zoom >= MAX_ZOOM}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Reset view"
            onClick={reset}
          >
            <Home className="h-4 w-4" />
          </Button>
        </div>
        {canReveal && (
          <div className="flex items-center gap-1">
            {hiddenCount > 0 && (
              <Button
                type="button"
                variant={hiddenShown ? "secondary" : "outline"}
                size="sm"
                onClick={() => setHiddenShown((v) => !v)}
                title={
                  hiddenShown
                    ? "Showing hidden locations — click to preview the players' view"
                    : "Previewing the players' view — click to show hidden locations"
                }
              >
                {hiddenShown ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {hiddenCount} hidden
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={bulkPending || hiddenCount === 0}
              onClick={() => void revealAll(true)}
            >
              {bulkPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              Reveal all
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={bulkPending || hiddenCount === pins.length}
              onClick={() => void revealAll(false)}
            >
              <EyeOff className="h-4 w-4" />
              Hide all
            </Button>
          </div>
        )}
      </div>

      {bulkError && (
        <p role="alert" className="text-sm text-destructive">
          {bulkError}
        </p>
      )}

      <div
        ref={frameRef}
        className="relative w-full overflow-hidden rounded-lg border bg-muted/40 select-none"
        style={{
          aspectRatio: aspect ?? 2,
          cursor: zoom > 1 ? (drag.current ? "grabbing" : "grab") : "default",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
        }}
      >
        <div
          className="absolute inset-0 origin-center transition-transform duration-100 ease-out"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          }}
        >
          {imageUrl ? (
            // Deliberately a plain img: the map is a single user-supplied asset of
            // unknown dimensions that gets CSS-transformed, which next/image's
            // sizing machinery only gets in the way of.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`Map of ${mapName}`}
              className="h-full w-full object-contain"
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  setAspect(img.naturalWidth / img.naturalHeight);
                }
              }}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageOff className="h-8 w-8" />
              <p className="max-w-xs text-center text-sm">
                No map image yet. Export a PNG from Azgaar and upload it to see the
                pins in place.
              </p>
            </div>
          )}

          {visible.map((pin) => {
            const style = styleFor(pin.kind);
            const dimmed = matches ? !matches.has(pin.id) : false;
            const hidden = !isRevealed(pin);
            const Icon = style.icon;
            return (
              <button
                key={pin.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActive(active === pin.id ? null : pin.id);
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  left: `${pin.x * 100}%`,
                  top: `${pin.y * 100}%`,
                  // Keep pins a constant on-screen size as the map scales.
                  transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                  opacity: dimmed ? 0.25 : 1,
                  zIndex: active === pin.id ? 20 : 10,
                }}
                aria-label={pin.label}
              >
                <span
                  className={`block rounded-full border shadow ${style.colour} ${
                    hidden ? "opacity-50 ring-1 ring-dashed ring-foreground/40" : ""
                  }`}
                  style={{ width: style.dot * 2, height: style.dot * 2 }}
                />
                {(active === pin.id || (matches?.has(pin.id) && matches.size <= 12)) && (
                  <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-[11px] font-medium text-popover-foreground shadow ring-1 ring-border">
                    {pin.label}
                  </span>
                )}
                {Icon && style.dot >= 8 && (
                  <Icon className="pointer-events-none absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 text-black/70" />
                )}
              </button>
            );
          })}
        </div>

        {zoom === 1 && (
          <p className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
            <Maximize2 className="h-3 w-3" />
            Ctrl/⌘ + scroll to zoom
          </p>
        )}
      </div>

      {active && <PinCard pin={pins.find((p) => p.id === active)!} canReveal={canReveal} isRevealed={isRevealed} onToggle={toggleReveal} />}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {(["city", "town", "village", "landmark", "dungeon", "ruin"] as const).map((kind) => (
          <span key={kind} className="flex items-center gap-1.5 capitalize">
            <span
              className={`inline-block rounded-full border ${styleFor(kind).colour}`}
              style={{ width: styleFor(kind).dot * 2, height: styleFor(kind).dot * 2 }}
            />
            {kind}
          </span>
        ))}
        <span className="ml-auto tabular-nums">{pins.length.toLocaleString()} pins</span>
      </div>
    </div>
  );
}

function PinCard({
  pin,
  canReveal,
  isRevealed,
  onToggle,
}: {
  pin: ViewerPin;
  canReveal: boolean;
  isRevealed: (pin: ViewerPin) => boolean;
  onToggle: (pin: ViewerPin) => void;
}) {
  const hidden = !isRevealed(pin);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      {/* A div, not a p: Badge renders a div and cannot nest inside one. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 font-medium">
        {pin.label}
        <Badge variant="outline" className="capitalize">
          {pin.kind}
        </Badge>
        {hidden && <Badge variant="secondary">Hidden from players</Badge>}
      </div>
      {pin.href && (
        <Button size="sm" variant="outline" asChild>
          <Link href={pin.href}>Open article</Link>
        </Button>
      )}
      {canReveal && (
        <Button size="sm" variant={hidden ? "default" : "ghost"} onClick={() => onToggle(pin)}>
          {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {hidden ? "Reveal to players" : "Hide"}
        </Button>
      )}
    </div>
  );
}
