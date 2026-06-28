import type { NextRequest } from "next/server";
import { getKrwPrices } from "@/lib/finance/prices";
import { financeSource } from "@/lib/finance/source";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("symbols")?.trim() ?? "";
  const symbols = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const { prices, previousCloses, currencies, available } =
    await getKrwPrices(symbols);
  return Response.json({ prices, previousCloses, currencies, available, _source: financeSource() });
}
