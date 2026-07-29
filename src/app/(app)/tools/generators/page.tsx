import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText, Store, User, Wand2, Type } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Generators" };

const TOOLS = [
  {
    href: "/tools/generators/npc",
    icon: User,
    title: "NPC Generator",
    body: "Full NPCs with personality, hooks, and a portrait prompt.",
  },
  {
    href: "/tools/generators/names",
    icon: Type,
    title: "Name Generator",
    body: "People, settlements, taverns, and ships. Save favorites.",
  },
  {
    href: "/tools/generators/backstory",
    icon: ScrollText,
    title: "Backstory Generator",
    body: "Origins, turning points, goals, and adventure hooks.",
  },
  {
    href: "/tools/shops",
    icon: Store,
    title: "Shop Generator",
    body: "Shops with a keeper, inventory, and prices by settlement.",
  },
] as const;

export default function GeneratorsHubPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        icon={Wand2}
        title="Generators"
        description={
          <>
            Spin up NPCs, names, shops, and backstories to PF2E flavor. Every
            result is reproducible and copies out as markdown for your world.
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map(({ href, icon: Icon, title, body }) => (
          <Link key={href} href={href}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader>
                <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="font-display text-lg">{title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {body}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
