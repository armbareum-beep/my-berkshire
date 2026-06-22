import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFxToKrw } from "@/lib/finance/fx";
import type { ParsedRow } from "../parse/route";
import type { Database } from "@/lib/supabase/database.types";

type EventInsertRow = Database["public"]["Tables"]["events"]["Insert"];

interface ConfirmBody {
  rows: ParsedRow[];
  accountId: string;
  holdingId: string;
}

function isUsdSymbol(symbol: string): boolean {
  // 6자리 숫자 = KRW, 그 외 = USD (AAPL, TSLA 등)
  return !/^\d{6}$/.test(symbol);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await request.json()) as ConfirmBody;
  const { rows, accountId, holdingId } = body;

  if (!rows?.length || !accountId || !holdingId)
    return Response.json({ error: "필수 파라미터가 없습니다." }, { status: 400 });

  // 계좌가 이 유저의 것인지 확인
  const { data: account } = await supabase
    .from("accounts")
    .select("id, holding_id")
    .eq("id", accountId)
    .eq("holding_id", holdingId)
    .single();
  if (!account) return Response.json({ error: "계좌를 찾을 수 없습니다." }, { status: 403 });

  // 현재 holdings의 founded_at 조회
  const { data: holding } = await supabase
    .from("holdings")
    .select("founded_at, user_id")
    .eq("id", holdingId)
    .single();
  if (!holding || holding.user_id !== user.id)
    return Response.json({ error: "권한이 없습니다." }, { status: 403 });

  // 외화 환율 (USD 종목이 있는 경우)
  const hasUsd = rows.some((r) => r.symbol && isUsdSymbol(r.symbol));
  const fx = hasUsd ? await getFxToKrw(["USD"]) : {};
  const usdRate = fx["USD"] ?? 1;

  // founded_at 조정이 필요한지 확인
  const earliestDate = rows.reduce((min, r) => (r.date < min ? r.date : min), holding.founded_at);
  if (earliestDate < holding.founded_at) {
    await supabase
      .from("holdings")
      .update({ founded_at: earliestDate })
      .eq("id", holdingId);
  }

  // 이벤트 행 생성
  const eventRows: EventInsertRow[] = [];
  for (const row of rows) {
    if (!row.symbol) continue; // 심볼 없으면 스킵

    const isUsd = isUsdSymbol(row.symbol);
    const currency = isUsd ? "USD" : "KRW";
    const fxRate = isUsd ? usdRate : 1;
    const priceKrw = isUsd ? row.price * usdRate : row.price;
    const feeKrw = isUsd ? row.fee * usdRate : row.fee;

    if (row.type === "BUY") {
      const totalKrw = priceKrw * (row.quantity ?? 1);
      // DEPOSIT: 자본 투입
      eventRows.push({
        account_id: accountId,
        type: "DEPOSIT",
        symbol: null,
        date: row.date,
        quantity: null,
        price_or_amount: totalKrw,
        fee_and_tax: 0,
        currency,
        fx_rate: fxRate,
        source: "manual",
      });
      // BUY: 매수
      eventRows.push({
        account_id: accountId,
        type: "BUY",
        symbol: row.symbol,
        date: row.date,
        quantity: row.quantity,
        price_or_amount: priceKrw,
        fee_and_tax: feeKrw,
        currency,
        fx_rate: fxRate,
        source: "manual",
      });
    } else if (row.type === "SELL") {
      eventRows.push({
        account_id: accountId,
        type: "SELL",
        symbol: row.symbol,
        date: row.date,
        quantity: row.quantity,
        price_or_amount: priceKrw,
        fee_and_tax: feeKrw,
        currency,
        fx_rate: fxRate,
        source: "manual",
      });
    } else if (row.type === "DIVIDEND") {
      const totalKrw = priceKrw * (row.quantity ?? 1);
      eventRows.push({
        account_id: accountId,
        type: "DIVIDEND",
        symbol: row.symbol,
        date: row.date,
        quantity: null,
        price_or_amount: totalKrw,
        fee_and_tax: feeKrw,
        currency,
        fx_rate: fxRate,
        source: "manual",
      });
    }
  }

  if (eventRows.length === 0)
    return Response.json({ error: "저장할 거래가 없습니다. 심볼이 매핑된 행이 있는지 확인하세요." }, { status: 400 });

  const { error } = await supabase.from("events").insert(eventRows);
  if (error) {
    console.error("Import confirm error:", error);
    return Response.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }

  return Response.json({ ok: true, count: eventRows.length });
}
