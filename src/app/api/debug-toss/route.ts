import { tossToken } from "@/lib/finance/toss/client";
import { financeSource } from "@/lib/finance/source";

export const dynamic = "force-dynamic";

export async function GET() {
  const source = financeSource();
  const base = process.env.TOSS_API_BASE_URL ?? "(missing)";
  let token: string | null = null;
  let tokenError: string | null = null;
  let priceRaw: unknown = null;
  let priceError: string | null = null;

  try {
    token = await tossToken();
  } catch (e) {
    tokenError = String(e);
  }

  if (token) {
    try {
      const url = new URL(`${base}/api/v1/prices`);
      url.searchParams.set("symbols", "041830");
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      priceRaw = { status: res.status, body: await res.json() };
    } catch (e) {
      priceError = String(e);
    }
  }

  return Response.json({ source, base, tokenOk: !!token, tokenError, priceRaw, priceError });
}
