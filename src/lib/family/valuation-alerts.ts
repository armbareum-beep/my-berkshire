import { quoteBasisLabel, quoteTimeBasis, type RegularSession } from "./quote-session";

/** Private, versioned criteria stored in family_vault.data, never in the public bundle. */
export type AlertMethod = {
  id: "DCF" | "PTBV";
  label: string;
  down: number[];
  up: number[];
  note: string;
  status?: "active" | "hold";
};
export type StockAlertBasis = {
  currency: "KRW";
  updatedAt: string;
  basisDate: string;
  methods: AlertMethod[];
};
export type ValuationAlerts = Record<string, StockAlertBasis>;
export type PriceWatchCondition = { id: string; label: string; direction: "lte" | "gte"; value: number | null; note: string };
export type PriceWatchInstrument = { symbol: string; exchange: string; currency: string; basisDate: string | null; updatedAt: string; status: "verified" | "pending"; conditions: PriceWatchCondition[]; note: string };
export type PriceWatchConnection = { version: 1; updatedAt: string; title: string; instruments: PriceWatchInstrument[] };
/** Screen-only provider observation, independent of KRW portfolio valuation and FX. */
export type NativeQuote = { symbol: string; exchange: string; currency: string; price: number; marketTime: number; unit: "share" | "other"; regularSession?: RegularSession; regularSessions?: RegularSession[]; sessionTimeZone?: string };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const iso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const note = (v: unknown): v is string => typeof v === "string" && v.length <= 6000;
const symbol = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9.^=-]{1,20}$/.test(v);
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

export function readPriceWatchConnection(input: unknown): PriceWatchConnection | null {
  if (!record(input) || input.version !== 1 || !iso(input.updatedAt) || !text(input.title, 120) || !Array.isArray(input.instruments) || input.instruments.length > 50) return null;
  if (!input.instruments.every(i => record(i) && symbol(i.symbol) && typeof i.exchange === "string" && /^[A-Z0-9-]{2,20}$/.test(i.exchange) && typeof i.currency === "string" && /^[A-Z]{3}$/.test(i.currency) && (date(i.basisDate) || (i.basisDate === null && i.status === "pending")) && iso(i.updatedAt) && ["verified", "pending"].includes(String(i.status)) && note(i.note) && Array.isArray(i.conditions) && (i.conditions.length > 0 || i.status === "pending") && i.conditions.length <= 20 && i.conditions.every(c => record(c) && text(c.id, 40) && text(c.label, 120) && ["lte", "gte"].includes(String(c.direction)) && (c.value === null || positive(c.value)) && note(c.note)) && new Set(i.conditions.map(c => c.id)).size === i.conditions.length)) return null;
  if (new Set(input.instruments.map(i => `${i.exchange}:${i.symbol}`)).size !== input.instruments.length) return null;
  return input as PriceWatchConnection;
}
export function priceWatchEntries(input: unknown) {
  if (!record(input)) return [];
  return Object.entries(input).flatMap(([taskId, v]) => {
    const connection = readPriceWatchConnection(v);
    return connection ? connection.instruments.map(instrument => ({ taskId, title: connection.title, instrument })) : [];
  });
}
/** Only explicit exchange-scoped aliases; never FFH.U/FRFHF/FIH.U or BRK.A. */
export function watchQuoteSymbol(i: Pick<PriceWatchInstrument, "symbol" | "exchange">) {
  if (i.exchange === "NYSE" && ["BRK.B", "BRK-B"].includes(i.symbol)) return "BRK-B";
  if (i.exchange === "TSX") return i.symbol.endsWith(".TO") ? i.symbol : i.symbol + ".TO";
  return i.symbol;
}
export function watchesForSymbol(input: unknown, code: string) {
  return priceWatchEntries(input).filter(({ instrument: i }) => code === watchQuoteSymbol(i) || code === i.symbol);
}
/** Exact listing/currency/unit with fresh intraday quotes or the last verified session close. */
export function watchConditionStates(i: PriceWatchInstrument, q: NativeQuote | undefined, now = Date.now()) {
  const basis = quoteTimeBasis(q, now);
  let reason = "";
  if (!q) reason = "시세 없음";
  else if ((q.symbol !== watchQuoteSymbol(i) && !(i.exchange === "KRX" && /^\d{6}$/.test(i.symbol) && [i.symbol + ".KS", i.symbol + ".KQ"].includes(q.symbol))) || q.exchange !== i.exchange) reason = "상장시장·종목 확인 필요";
  else if (q.currency !== i.currency || q.unit !== "share") reason = "통화·주식단위 확인 필요";
  else if (!positive(q.price) || !basis) reason = "시세 시각·가격 확인 필요";
  const conditions = i.conditions.map(c => ({ condition: c, state: i.status === "pending" || c.value === null ? "pending" as const : reason ? "unjudged" as const : (c.direction === "lte" ? q!.price <= c.value : q!.price >= c.value) ? "hit" as const : "waiting" as const }));
  return { reason, conditions, quoteLabel: !reason && q && basis ? quoteBasisLabel(basis, q.marketTime) : undefined };
}
function levels(v: unknown, down: boolean): v is number[] {
  return Array.isArray(v) && v.length <= 3 && v.every((n, i) => typeof n === "number" && Number.isFinite(n) && n > 0 && n < 1e12 && (!i || (down ? n < v[i - 1] : n > v[i - 1])));
}
/** Bad criteria must not break portfolio totals or turn into a false 'not reached'. */
export function readAlertBasis(input: unknown): StockAlertBasis | null {
  if (!record(input) || input.currency !== "KRW" || !date(input.basisDate) || !text(input.updatedAt, 40) || !Number.isFinite(Date.parse(input.updatedAt)) || !Array.isArray(input.methods) || !input.methods.length || input.methods.length > 2) return null;
  if (!input.methods.every(m => record(m) && ["DCF", "PTBV"].includes(String(m.id)) && text(m.label, 40) && typeof m.note === "string" && m.note.length <= 1000 && levels(m.down, true) && levels(m.up, false) && m.down.length + m.up.length > 0 && (!m.down.length || !m.up.length || m.down[0] < m.up[0]) && (m.status === undefined || ["active", "hold"].includes(String(m.status))))) return null;
  if (new Set(input.methods.map(m => m.id)).size !== input.methods.length) return null;
  return input as StockAlertBasis;
}
/** Only timestamped, recent prices can light a stage. Values are per share, never position value. */
export function alertStages(method: AlertMethod, price: number | null, marketTime: number | undefined, now = Date.now()) {
  const age = typeof marketTime === "number" ? now - marketTime * 1000 : NaN;
  const usable = method.status !== "hold" && price !== null && Number.isFinite(price) && price > 0 && Number.isFinite(age) && age >= -300_000 && age <= 4 * 86400_000;
  return {
    usable,
    down: method.down.map(p => usable ? price! <= p : null),
    up: method.up.map(p => usable ? price! >= p : null),
  };
}
