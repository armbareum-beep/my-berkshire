import { summarize, type Portfolio, type Product, type ProductKind } from "./model";

type Summary = ReturnType<typeof summarize>;
const ETF_BRANDS = /^(KODEX|TIGER|RISE|ACE|SOL|KBSTAR|HANARO|PLUS|KIWOOM|ARIRANG|KOSEF|TIME|1Q|WON|BNK|FOCUS|TREX|마이다스|파워)/i;

/** Stored kind first; otherwise a conservative guess from the name and exposure. */
export function productKind(product: Product): ProductKind {
  if (product.kind) return product.kind;
  const name = product.name.replace(/\s/g, "");
  if (product.exposure[4] === 1 && /예금|RP|MMF|발행어음/i.test(name)) return "deposit";
  if (ETF_BRANDS.test(name)) return "etf";
  return product.exposure[4] === 1 ? "bond" : "stock";
}

/** 한국·중국·미국·기타 index for a cash currency. */
export function currencyCountry(currency: string) {
  return currency === "KRW" ? 0 : currency === "CNY" || currency === "HKD" ? 1 : currency === "USD" ? 2 : 3;
}

const zero = () => [0, 0, 0, 0];
const add = (to: number[], from: number[], scale = 1) => from.forEach((v, i) => { to[i] += v * scale; });

/**
 * Splits the selection by what is held: ETF equity, individual stock equity and
 * cash-like assets (cash by currency, bonds including the bond part of mixed ETFs, deposits).
 * Each row is [한국, 중국, 미국, 기타] in KRW.
 */
export function allocationBreakdown(p: Portfolio, s: Summary) {
  const etf = zero(), stock = zero(), cashLike = zero();
  const cash: Record<string, number> = {};
  let bond = 0, deposit = 0;
  for (const h of s.positions) {
    if (h.value === null) continue;
    const product = p.products[h.code], kind = productKind(product);
    add(kind === "etf" ? etf : stock, product.exposure.slice(0, 4), h.value);
    const fixed = h.value * product.exposure[4];
    if (!fixed) continue;
    add(cashLike, product.bondCountry ?? (kind === "deposit" ? [1, 0, 0, 0] : [0, 0, 0, 1]), fixed);
    if (kind === "deposit") deposit += fixed; else bond += fixed;
  }
  for (const a of s.selected) {
    for (const [currency, amount] of Object.entries(a.cashByCurrency ?? { KRW: a.cash })) {
      cash[currency] = (cash[currency] || 0) + amount;
      cashLike[currencyCountry(currency)] += amount;
    }
  }
  return { etf, stock, cashLike, cash, bond, deposit };
}

/** Current weights for the targets: 한국·중국·미국 equity, and everything else (cash, bonds, other equity). */
export function targetActuals(s: Summary) {
  return [s.exposure[0], s.exposure[1], s.exposure[2], s.nav - s.exposure[0] - s.exposure[1] - s.exposure[2]];
}

export type HoldingRow = { code: string; name: string; price: number | null; quantity: number; cost: number; value: number | null; profit: number | null; rate: number | null; accounts: string[] };
export type HoldingSort = "value" | "profit" | "rate";

/** One row per product across the selected accounts. */
export function consolidateHoldings(s: Summary): HoldingRow[] {
  const rows = new Map<string, HoldingRow>();
  for (const h of s.positions) {
    const row = rows.get(h.code) ?? { code: h.code, name: h.name, price: h.price, quantity: 0, cost: 0, value: 0, profit: 0, rate: null, accounts: [] };
    row.quantity += h.quantity;
    row.cost += h.cost;
    row.value = row.value === null || h.value === null ? null : row.value + h.value;
    row.profit = row.profit === null || h.profit === null ? null : row.profit + h.profit;
    row.accounts.push(h.account);
    rows.set(h.code, row);
  }
  for (const row of rows.values()) row.rate = row.profit !== null && row.cost > 0 ? row.profit / row.cost : null;
  return [...rows.values()];
}

/** Rows without a value for the key (unpriced, no cost) always go last. */
export function sortHoldings(rows: HoldingRow[], key: HoldingSort, descending: boolean) {
  return [...rows].sort((a, b) => {
    const x = a[key], y = b[key];
    if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1;
    return descending ? y - x : x - y;
  });
}
