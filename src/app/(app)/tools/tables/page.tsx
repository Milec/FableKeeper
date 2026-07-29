import type { Metadata } from "next";
import { Dices } from "lucide-react";
import { BUILTIN_TABLES } from "@/lib/tables/builtins";
import { TableRoller } from "@/modules/tables/table-roller";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Built-in Tables" };

export default function BuiltinTablesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
          <Dices className="h-7 w-7 text-primary" />
          Built-in Tables
        </h1>
        <p className="text-muted-foreground">
          Ready-to-roll tables you can use in any campaign. Roll here, or build
          your own custom tables inside a campaign.
        </p>
      </div>

      <div className="space-y-4">
        {BUILTIN_TABLES.map((table) => (
          <Card key={table.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="font-display text-lg">{table.name}</CardTitle>
                <Badge variant="secondary">{table.category}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{table.description}</p>
            </CardHeader>
            <CardContent>
              <TableRoller entries={table.entries} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
