import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Dices,
  Map as MapIcon,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";

const FEATURES = [
  {
    icon: BookOpen,
    title: "World Builder",
    body: "Worlds, nations, NPCs, and lore with Obsidian-style backlinks, tags, and version history.",
  },
  {
    icon: Users,
    title: "Character Manager",
    body: "Full PF2E character sheets with Pathbuilder import and export for you and your players.",
  },
  {
    icon: Dices,
    title: "Rollable Tables & Dice",
    body: "A Foundry-inspired table system on top of a complete, tested dice engine.",
  },
  {
    icon: MapIcon,
    title: "Interactive Maps",
    body: "Zoomable player maps with fog of war and reveals you control turn by turn.",
  },
  {
    icon: Shield,
    title: "Granular Permissions",
    body: "Owner, GM, Assistant GM, Player, and Viewer roles. Players see only what you reveal.",
  },
  {
    icon: Sparkles,
    title: "AI Assist",
    body: "Generate NPCs, shops, and lore to PF2E rules — always editable before you save.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Dices className="h-6 w-6 text-primary" />
            <span className="font-display text-xl font-bold tracking-wide">
              FableKeeper
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="container flex flex-col items-center gap-6 py-24 text-center md:py-32">
          <Badge variant="secondary" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Built for Pathfinder Second Edition
          </Badge>
          <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Run unforgettable{" "}
            <span className="text-primary">PF2E campaigns</span> from one place.
          </h1>
          <p className="max-w-2xl text-balance text-lg text-muted-foreground">
            FableKeeper unites worldbuilding, character management, encounter
            design, rollable tables, and interactive maps into a single,
            fast, dark-mode-first workspace for you and your table.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/signup">
                Start your first campaign
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">I already have an account</Link>
            </Button>
          </div>
        </section>

        {/* Features */}
        <section className="container pb-24">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="h-full">
                <CardHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="font-display text-lg">{title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {body}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <p>
            FableKeeper is an independent, unofficial tool. Pathfinder is a
            trademark of Paizo Inc.
          </p>
          <p>Made for GMs and their players.</p>
        </div>
      </footer>
    </div>
  );
}
