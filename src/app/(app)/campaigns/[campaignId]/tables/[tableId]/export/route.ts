import { NextResponse } from "next/server";
import { getRollTable, tableEntries } from "@/lib/tables/queries";
import { tableToExport } from "@/lib/tables/roll";
import { slugify } from "@/lib/utils";

/** Export a roll table as JSON (RLS-scoped by the underlying query). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string; tableId: string }> },
) {
  const { campaignId, tableId } = await params;
  const table = await getRollTable(tableId);
  if (!table || table.campaign_id !== campaignId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const payload = tableToExport(table.name, table.description, tableEntries(table));
  const filename = `${slugify(table.name) || "table"}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
