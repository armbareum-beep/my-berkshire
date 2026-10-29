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
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
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
