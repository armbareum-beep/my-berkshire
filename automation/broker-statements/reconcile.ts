/**
 * 증권사 월간 명세서와 가족 장부(family_vault)를 대조한다.
 *
 * 원칙: 이미 들어 있고 맞으면 건드리지 않는다. 빠졌거나 틀린 것만 고친다.
 * (헌장 V — 같은 포지션을 두 경로로 기록해 이중 계상하지 않는다)
 *
 * 순수 함수만 둔다. 읽기·쓰기는 호출하는 쪽이 한다.
 */
import type { ParsedStatement } from "./parse";

export interface VaultAccount {
  id: string;
  broker?: string;
  name?: string;
  owner?: string;
  mask?: string;
  cash?: number;
  div?: number;
  interest?: number;
  valuationDate?: string;
}

export interface VaultHolding {
  account: string;
  code: string;
  quantity: number;
}

export interface VaultFlow {
  id: string;
  account: string;
  date: string;
  amount: number;
}

export type DiffKind =
  | "account-unmatched"
  | "currency-unsupported"
  | "cash"
  | "flow-missing"
  | "flow-amount"
  | "holding-quantity"
  | "holding-missing";

export interface Diff {
  kind: DiffKind;
  account: string;
  label: string;
  /** 장부의 현재 값. 없으면 null. */
  current: number | null;
  /** 명세서가 말하는 값. */
  expected: number | null;
  /** 사람이 읽을 한 줄. */
  message: string;
}

/**
 * 장부의 현금흐름 부호: 계좌로 들어온 돈이 음수다(관찰된 규약 — 이체입금 100,000 → -100,000).
 * 명세서의 입금/출금을 장부 부호로 바꾼다.
 */
export function toFlowAmount(type: string, amount: number): number {
  if (type === "DEPOSIT") return -Math.abs(amount);
  if (type === "WITHDRAWAL") return Math.abs(amount);
  throw new Error(`현금흐름으로 바꿀 수 없는 거래입니다: ${type}`);
}

const segments = (mask: string) =>
  mask.split("-").map((s) => s.replace(/[^0-9*]/g, "")).filter(Boolean);

/**
 * 두 마스크가 같은 계좌를 가리킬 수 있는가.
 *
 * 칸(-) 단위로 비교한다. 별표만으로 된 칸은 몇 자리를 가린 건지 알 수 없으므로
 * (장부의 "***-1953-10" 에서 앞 칸은 네 자리 6292 를 가린 별표 세 개다)
 * 무엇과도 맞는 것으로 보고, 숫자가 섞인 칸만 자릿수까지 맞춰 본다.
 * 칸 수가 다르면 증권사 표기 자체가 달라 비교할 수 없다.
 */
export function maskCompatible(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = segments(a);
  const y = segments(b);
  if (!x.length || x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    const p = x[i];
    const q = y[i];
    if (/^\*+$/.test(p) || /^\*+$/.test(q)) continue;
    if (p.length !== q.length) return false;
    for (let j = 0; j < p.length; j++) {
      if (p[j] !== "*" && q[j] !== "*" && p[j] !== q[j]) return false;
    }
  }
  return true;
}

/** 종목명 비교용 정규화. "TIGER200" 과 "TIGER 200" 을 같게 본다. */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, "").toUpperCase();
}

export interface AccountMatch {
  account: VaultAccount;
  /** 겹친 종목 수 / 명세서 종목 수 */
  score: number;
  reason: string;
}

/**
 * 명세서를 장부 계좌에 짝짓는다. 마스크는 증권사마다 가리는 자리가 달라 믿을 수 없으므로
 * 보유 종목 구성을 주된 근거로 쓴다(실제로 이쪽이 정확했다). 마스크는 가산점만 준다.
 */
export function matchAccount(
  statement: ParsedStatement,
  accounts: VaultAccount[],
  holdings: VaultHolding[],
  codeOf: (name: string) => string | undefined,
): AccountMatch | null {
  const wanted = new Set(
    statement.holdings.map((h) => codeOf(h.name)).filter((c): c is string => !!c),
  );
  const scored: AccountMatch[] = [];
  for (const account of accounts) {
    const owned = new Set(holdings.filter((h) => h.account === account.id).map((h) => h.code));
    let overlap = 0;
    for (const code of wanted) if (owned.has(code)) overlap += 1;
    const byMask = maskCompatible(statement.accountNo, account.mask);
    if (!overlap && !byMask) continue;
    // 종목이 하나도 없는 계좌(현금성)는 마스크로만 짝지을 수 있다.
    const score = wanted.size ? overlap / wanted.size : byMask ? 1 : 0;
    const reason = wanted.size
      ? `보유 ${overlap}/${wanted.size} 일치${byMask ? " · 마스크 부합" : ""}`
      : "마스크 부합";
    scored.push({ account, score, reason });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  // 절반도 안 겹치면 짝으로 보지 않는다 — 엉뚱한 계좌에 쓰는 것보다 못 찾는 게 낫다.
  if (!best || best.score < 0.5) return null;
  // 같은 점수의 후보가 둘 이상이면 고르지 않는다. 마스크만으로는 가린 자리가 달라
  // 여러 계좌가 동시에 들어맞을 수 있는데, 그때 아무거나 고르면 남의 계좌에 쓰게 된다.
  if (scored.length > 1 && scored[1].score === best.score) return null;
  return best;
}

/** 같은 현금흐름인가. 날짜와 금액이 같으면 같은 건으로 본다. */
function sameFlow(a: { date: string; amount: number }, b: { date: string; amount: number }) {
  return a.date === b.date && Math.round(a.amount) === Math.round(b.amount);
}

/**
 * 명세서의 입출금이 장부에 있는지 본다.
 * 있으면 아무것도 하지 않는다. 없으면 flow-missing, 금액이 다르면 flow-amount.
 */
export function reconcileFlows(
  statement: ParsedStatement,
  accountId: string,
  vaultFlows: VaultFlow[],
): Diff[] {
  const mine = vaultFlows.filter((f) => f.account === accountId);
  const diffs: Diff[] = [];
  for (const event of statement.events) {
    if (event.type !== "DEPOSIT" && event.type !== "WITHDRAWAL") continue;
    // 외화 거래는 환율 없이 장부(원화)에 넣을 수 없다. 숫자만 옮기면 달러를
    // 원화로 적는 셈이 된다. 알리기만 하고 절대 자동으로 넣지 않는다.
    if ((event.currency || "KRW") !== "KRW") {
      diffs.push({
        kind: "currency-unsupported",
        account: accountId,
        label: `${event.date} ${event.label}`,
        current: null,
        expected: event.amount,
        message:
          `${event.date} ${event.label} ${event.currency} ${event.amount.toLocaleString()} — ` +
          "외화라 자동으로 넣지 않습니다. 환율 적용은 직접 해주세요.",
      });
      continue;
    }
    const expected = { date: event.date, amount: toFlowAmount(event.type, event.amount) };
    if (mine.some((f) => sameFlow(f, expected))) continue;
    const sameDay = mine.filter((f) => f.date === expected.date);
    if (sameDay.length === 1) {
      diffs.push({
        kind: "flow-amount",
        account: accountId,
        label: `${event.date} ${event.label}`,
        current: sameDay[0].amount,
        expected: expected.amount,
        message: `${event.date} 현금흐름 금액이 다릅니다: 장부 ${sameDay[0].amount.toLocaleString()} ≠ 명세서 ${expected.amount.toLocaleString()}`,
      });
      continue;
    }
    diffs.push({
      kind: "flow-missing",
      account: accountId,
      label: `${event.date} ${event.label}`,
      current: null,
      expected: expected.amount,
      message: `${event.date} ${event.label} ${Math.abs(expected.amount).toLocaleString()}원이 장부에 없습니다`,
    });
  }
  return diffs;
}

/**
 * 예수금 대조. 장부의 기준일이 명세서 기준일과 다르면 그 사이 거래로 값이 달라지므로
 * 비교하지 않는다 — 다르다고 알리면 거짓 경보가 된다.
 */
export function reconcileCash(statement: ParsedStatement, account: VaultAccount): Diff[] {
  if (!account.valuationDate || account.valuationDate !== statement.asOf) return [];
  // 외화 예수금은 장부의 원화 값과 단위가 달라 비교 자체가 뜻이 없다.
  if ((statement.currency || "KRW") !== "KRW") {
    return [
      {
        kind: "currency-unsupported",
        account: account.id,
        label: `예수금 (${statement.asOf})`,
        current: account.cash ?? null,
        expected: statement.cash,
        message:
          `예수금이 ${statement.currency} 표시라 원화 장부와 비교하지 않았습니다 ` +
          `(명세서 ${statement.cash.toLocaleString()} ${statement.currency}).`,
      },
    ];
  }
  const current = Math.round(account.cash ?? 0);
  const expected = Math.round(statement.cash);
  if (current === expected) return [];
  return [
    {
      kind: "cash",
      account: account.id,
      label: `예수금 (${statement.asOf})`,
      current,
      expected,
      message: `예수금이 다릅니다: 장부 ${current.toLocaleString()} ≠ 명세서 ${expected.toLocaleString()}`,
    },
  ];
}

/** 보유 수량 대조. 기준일이 어긋나면 그사이 매매로 달라지므로 비교하지 않는다. */
export function reconcileHoldings(
  statement: ParsedStatement,
  account: VaultAccount,
  holdings: VaultHolding[],
  codeOf: (name: string) => string | undefined,
): Diff[] {
  if (!account.valuationDate || account.valuationDate !== statement.asOf) return [];
  const mine = new Map(
    holdings.filter((h) => h.account === account.id).map((h) => [h.code, h.quantity]),
  );
  const diffs: Diff[] = [];
  for (const holding of statement.holdings) {
    const code = codeOf(holding.name);
    if (!code) continue;
    const current = mine.get(code);
    if (current === undefined) {
      diffs.push({
        kind: "holding-missing",
        account: account.id,
        label: holding.name,
        current: null,
        expected: holding.quantity,
        message: `${holding.name} ${holding.quantity.toLocaleString()}주가 장부에 없습니다`,
      });
    } else if (Math.round(current) !== Math.round(holding.quantity)) {
      diffs.push({
        kind: "holding-quantity",
        account: account.id,
        label: holding.name,
        current,
        expected: holding.quantity,
        message: `${holding.name} 수량이 다릅니다: 장부 ${current.toLocaleString()} ≠ 명세서 ${holding.quantity.toLocaleString()}`,
      });
    }
  }
  return diffs;
}

/**
 * 명세서가 말하는 그 달의 배당·이자를 통화별로 낸다.
 * 해외 계좌는 한 명세서 안에서도 원화 이자와 달러 배당이 섞여 나오므로
 * 한 숫자로 더하면 뜻이 없어진다. 장부는 누적이라 바로 비교할 수 없어 따로 낸다.
 */
export function monthlyIncome(statement: ParsedStatement): {
  dividend: Record<string, number>;
  interest: Record<string, number>;
} {
  const dividend: Record<string, number> = {};
  const interest: Record<string, number> = {};
  for (const event of statement.events) {
    const bucket =
      event.type === "DIVIDEND" ? dividend : event.type === "INTEREST" ? interest : null;
    if (!bucket) continue;
    const currency = event.currency || "KRW";
    bucket[currency] = (bucket[currency] ?? 0) + event.amount;
  }
  return { dividend, interest };
}

/** 통화별 합계를 "1,600원 · USD 6.84" 처럼 읽기 좋게. 비어 있으면 "0". */
export function formatIncome(sums: Record<string, number>): string {
  const parts = Object.entries(sums).filter(([, v]) => v);
  if (!parts.length) return "0";
  return parts
    .map(([currency, value]) =>
      currency === "KRW" ? `${value.toLocaleString()}원` : `${currency} ${value.toLocaleString()}`,
    )
    .join(" · ");
}
