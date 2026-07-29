import type { Metadata } from "next";
import { BookOpen, Dices } from "lucide-react";
import {
  BUILTIN_TABLES,
  REFERENCE_TABLES,
  PF2E_DATA_META,
  attribution,
  type BuiltinTable,
} from "@/lib/tables/builtins";
import { TableRoller } from "@/modules/tables/table-roller";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "PF2E Tables" };

function TableCard({ table, rollable }: { table: BuiltinTable; rollable: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="font-display text-lg">{table.name}</CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="font-mono">
              {table.die}
            </Badge>
            <Badge variant="secondary">{attribution(table)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <TableRoller
          entries={table.entries}
          columns={table.columns}
          dieLabel={table.die}
          rollable={rollable}
        />
      </CardContent>
    </Card>
  );
}

export default function BuiltinTablesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
          <Dices className="h-7 w-7 text-primary" />
          Pathfinder 2e Tables
        </h1>
        <p className="text-muted-foreground">
          Published PF2E tables, ready to roll. Every entry is listed — press
          Roll and the result is highlighted in place.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
          <Dices className="h-5 w-5 text-primary" />
          Roll tables
          <span className="text-sm font-normal text-muted-foreground">
            ({BUILTIN_TABLES.length})
          </span>
        </h2>
        {BUILTIN_TABLES.map((t) => (
          <TableCard key={t.id} table={t} rollable />
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
          <BookOpen className="h-5 w-5 text-primary" />
          Reference tables
          <span className="text-sm font-normal text-muted-foreground">
            ({REFERENCE_TABLES.length})
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">
          Lookup tables you read by level or score rather than roll on — treasure
          budgets, wealth, crafting, and the like.
        </p>
        {REFERENCE_TABLES.map((t) => (
          <TableCard key={t.id} table={t} rollable={false} />
        ))}
      </section>

      <footer className="space-y-1 border-t pt-4 text-xs text-muted-foreground">
        <p>
          Table data ingested {PF2E_DATA_META.generatedAt} from open-licensed
          Pathfinder 2e sources (OGL 1.0a / ORC) via {PF2E_DATA_META.source}.
        </p>
        <p>
          Pathfinder is a trademark of Paizo Inc. FableKeeper is unofficial and
          unaffiliated. Adventure Path and card-deck tables are not included, as
          that content is not open-licensed — add those as custom tables in your
          campaign.
        </p>
      </footer>
    </div>
  );
}
