"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getPrices } from "@/lib/finance/prices";
import { getFxToKrw } from "@/lib/finance/fx";
import { estimateFeeAndTax } from "@/lib/finance/fees";
import { todayKST } from "@/lib/date";
import type { Database } from "@/lib/supabase/database.types";

export async function toggleYearComplete(holdingId: string, year: number, complete: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: holding } = await supabase
    .from("holdings")
    .select("completed_years, user_id")
    .eq("id", holdingId)
    .single();
  if (!holding || holding.user_id !== user.id) return { ok: false };

  const current: number[] = (holding.completed_years as number[]) ?? [];
  const updated = complete
    ? [...new Set([...current, year])]
    : current.filter((y) => y !== year);

  await supabase
    .from("holdings")
    .update({ completed_years: updated })
    .eq("id", holdingId);

  revalidatePath("/import");
  return { ok: true };
}

/**
 * 설립 확정(첫 거래 선언) 토글 — 사용자가 "이게 내 첫 거래"라고 선언해 연혁 복원을 완료(봉인)한다.
 * founded_at 은 건드리지 않는다(이미 가장 이른 기록). 더 이른 거래가 들어오면 코드가 자동 해제한다.
 */
export async function declareFounding(holdingId: string, declared: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: holding } = await supabase
    .from("holdings")
    .select("id, user_id")
    .eq("id", holdingId)
    .single();
  if (!holding || holding.user_id !== user.id)
    return { ok: false, error: "권한이 없습니다." };

  const { error } = await supabase
    .from("holdings")
    .update({ founding_declared: declared })
    .eq("id", holdingId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/import");
  revalidatePath("/dashboard");
  return { ok: true };
}

export interface ReconstructTrade {
  type: "BUY" | "SELL";
  date: string; // YYYY-MM-DD
  quantity: number; // 네이티브 수량
  price: number; // 네이티브 단가
}

type ReconstructResult =
  | { ok: true; note?: string }
  | { ok: false; error: string; target?: number; net?: number };

/**
 * 종목 정밀도 복원(스테이징식) — 화면에서 모아온 실제 매매(trades)를 한 번에 저장하고
 * 동시에 온보딩 스냅샷을 삭제한다. 실제 매매는 이 호출 전까지 DB에 없으므로(클라이언트 보관)
 * 일시적 이중 계상이 없다. 순수량이 스냅샷 보유와 일치할 때만 커밋한다(평단가는 실제로 교체됨).
 * 매수는 매수일에 증자(DEPOSIT)와 짝지어 기록(설립 모델). 과거 거래면 설립일도 당겨진다.
 */
export async function reconstructPosition(
  holdingId: string,
  symbol: string,
  trades: ReconstructTrade[],
): Promise<ReconstructResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: holding } = await supabase
    .from("holdings")
    .select("id, user_id, mode, founded_at, founding_declared")
    .eq("id", holdingId)
    .single();
  if (!holding || holding.user_id !== user.id)
    return { ok: false, error: "권한이 없습니다." };
  if (holding.mode !== "ledger")
    return { ok: false, error: "장부 모드에서만 복원할 수 있어요." };

  const today = todayKST();
  const clean = (trades ?? []).filter(
    (t) =>
      (t.type === "BUY" || t.type === "SELL") &&
      Number(t.quantity) > 0 &&
      Number(t.price) > 0 &&
      !!t.date &&
      t.date <= today,
  );
  if (clean.length === 0) return { ok: false, error: "입력한 거래가 없어요." };

  const { data: accs } = await supabase
    .from("accounts")
    .select("id, commission_rate, account_type")
    .eq("holding_id", holdingId);
  const accounts = accs ?? [];
  if (accounts.length === 0)
    return { ok: false, error: "계좌를 찾을 수 없습니다." };
  const accountIds = accounts.map((a) => a.id);

  const { data: evs } = await supabase
    .from("events")
    .select("id, account_id, type, symbol, quantity, price_or_amount, source")
    .in("account_id", accountIds)
    .is("deleted_at", null);
  const rows = evs ?? [];
  const signed = (e: { type: string; quantity: number | null }) =>
    (e.type === "BUY" ? 1 : e.type === "SELL" ? -1 : 0) * Number(e.quantity ?? 0);
  const snapRows = rows.filter((e) => e.source === "snapshot");
  const snapBuys = snapRows.filter((e) => e.type === "BUY" && e.symbol === symbol);
  if (snapBuys.length === 0)
    return { ok: false, error: "복원할 스냅샷이 없어요." };
  const snapshotQty = rows
    .filter((e) => e.symbol === symbol && e.source === "snapshot")
    .reduce((s, e) => s + signed(e), 0);
  const accountId = snapBuys[0].account_id; // 스냅샷 계좌에 귀속

  // 검증: 날짜순 진행 시 음수 보유 없음 + 최종 순수량 == 스냅샷 보유.
  const TOL = 1e-9;
  const sorted = [...clean].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  let run = 0;
  for (const t of sorted) {
    run += t.type === "BUY" ? t.quantity : -t.quantity;
    if (run < -TOL)
      return {
        ok: false,
        error: "매도가 보유보다 많아요(날짜 순서를 확인하세요).",
        target: snapshotQty,
        net: run,
      };
  }
  if (Math.abs(run - snapshotQty) > TOL)
    return {
      ok: false,
      error: `입력 순수량(${run})이 보유(${snapshotQty})와 달라요.`,
      target: snapshotQty,
      net: run,
    };

  // 통화·환율(장부는 입력 단가 사용, 외화면 ₩ 환산)
  const { currencies } = await getPrices([symbol]);
  const currency = currencies[symbol] ?? "KRW";
  if (currency === "KRW" && !/^\d{6}$/.test(symbol))
    return { ok: false, error: "종목 통화를 확인하지 못했어요. 잠시 후 다시 시도하세요." };
  let fx = 1;
  if (currency !== "KRW") {
    const f = await getFxToKrw([currency]);
    if (!f[currency])
      return { ok: false, error: `환율(${currency}/KRW)을 불러올 수 없어요.` };
    fx = f[currency];
  }
  const acct = accounts.find((a) => a.id === accountId)!;
  const commission = Number(acct.commission_rate);

  // 실제 거래 행 구성(매수=증자+매수 짝, 매도=매도). 한 번에 insert.
  const insertRows: Database["public"]["Tables"]["events"]["Insert"][] = [];
  for (const t of sorted) {
    const priceKrw = t.price * fx;
    const gross = t.quantity * priceKrw;
    const fee = estimateFeeAndTax(t.type, gross, commission, acct.account_type);
    if (t.type === "BUY") {
      insertRows.push({
        account_id: accountId,
        type: "DEPOSIT",
        symbol: null,
        quantity: null,
        price_or_amount: gross + fee,
        fee_and_tax: 0,
        date: t.date,
        currency,
        fx_rate: fx,
        source: "manual",
      });
      insertRows.push({
        account_id: accountId,
        type: "BUY",
        symbol,
        quantity: t.quantity,
        price_or_amount: priceKrw,
        fee_and_tax: fee,
        date: t.date,
        currency,
        fx_rate: fx,
        source: "manual",
      });
    } else {
      insertRows.push({
        account_id: accountId,
        type: "SELL",
        symbol,
        quantity: t.quantity,
        price_or_amount: priceKrw,
        fee_and_tax: fee,
        date: t.date,
        currency,
        fx_rate: fx,
        source: "manual",
      });
    }
  }

  const { error: insErr } = await supabase.from("events").insert(insertRows);
  if (insErr) return { ok: false, error: insErr.message };

  // 스냅샷 BUY + 짝 DEPOSIT 소프트 삭제(이중 계상 제거 — 평단가는 실제로 교체됨).
  const toDelete: string[] = [];
  for (const sb of snapBuys) {
    toDelete.push(sb.id);
    const amount = Number(sb.quantity ?? 0) * Number(sb.price_or_amount);
    const dep = snapRows.find(
      (e) =>
        e.type === "DEPOSIT" &&
        e.account_id === sb.account_id &&
        !toDelete.includes(e.id) &&
        Math.abs(Number(e.price_or_amount) - amount) < 1,
    );
    if (dep) toDelete.push(dep.id);
  }
  await supabase
    .from("events")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", toDelete);

  // 설립일 백스톱: 가장 이른 거래가 설립일보다 과거면 당기고, 설립 확정은 해제.
  const minDate = sorted[0].date;
  let note: string | undefined;
  if (minDate < holding.founded_at) {
    const unseal =
      (holding as { founding_declared?: boolean }).founding_declared ?? false;
    await supabase
      .from("holdings")
      .update({
        founded_at: minDate,
        ...(unseal ? { founding_declared: false } : {}),
      })
      .eq("id", holdingId);
    if (unseal) note = "더 과거 거래로 설립 확정이 해제됐어요(설립일 갱신).";
  }

  revalidatePath("/import");
  revalidatePath("/dashboard");
  revalidatePath("/activity");
  return { ok: true, note };
}
