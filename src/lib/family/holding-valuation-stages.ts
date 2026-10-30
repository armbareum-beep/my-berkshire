import { alertStages, readAlertBasis, watchConditionStates, watchQuoteSymbol, type NativeQuote, type PriceWatchCondition, type PriceWatchInstrument } from "./valuation-alerts";

export type StageState = "hit" | "waiting" | "pending" | "unjudged" | "unregistered";
export type HoldingStage = { id: string; label: string; state: StageState };
export type HoldingStageRow = { id: string; label: string; stages: HoldingStage[]; sellStages: HoldingStage[] };
const missing = (): HoldingStage[] => [1, 2, 3].map(n => ({ id: String(n), label: `${n}차`, state: "unregistered" }));
const method = (c: PriceWatchCondition) => {
  const text = `${c.id} ${c.label}`;
  if (/p\s*\/?\s*tbv|ptbv/i.test(text)) return { id: "PTBV", label: "P/TBV" };
  if (/dcf/i.test(text)) return { id: "DCF", label: "역DCF" };
  if (/per|eps/i.test(text)) return { id: "PER", label: "PER" };
  if (/자사주|repurchase|buyback/i.test(text)) return { id: "BUYBACK", label: "자사주" };
  return { id: `other:${c.id}`, label: c.label };
};

/** Retain each method and each actual condition; empty slots never become invented price lines. */
export function holdingValuationRows({ basis: input, price, marketTime, instruments, quotes = {}, now = Date.now() }: {
  basis: unknown; price: number | null; marketTime?: number; instruments: PriceWatchInstrument[]; quotes?: Record<string, NativeQuote>; now?: number;
}): HoldingStageRow[] {
  const rows: HoldingStageRow[] = [{ id: "PTBV", label: "P/TBV", stages: missing(), sellStages: missing() }, { id: "DCF", label: "역DCF", stages: missing(), sellStages: missing() }];
  const occupied = new Set<string>();
  const add = (row: HoldingStageRow) => {
    const emptyIndex = rows.findIndex(r => r.id === row.id && !occupied.has(r.id));
    if (emptyIndex >= 0) rows[emptyIndex] = row;
    else rows.push({ ...row, id: `${row.id}:${rows.length}` });
    occupied.add(row.id);
  };
  if (input !== undefined) {
    const basis = readAlertBasis(input);
    if (!basis) for (const row of rows) {
      row.stages = row.stages.map(s => ({ ...s, state: "pending" }));
      row.sellStages = row.sellStages.map(s => ({ ...s, state: "pending" }));
    }
    else for (const m of basis.methods) {
      const state = alertStages(m, price, marketTime, now);
      const slots = (values: (boolean | null)[]): HoldingStage[] => missing().map((slot, n) => n < values.length ? { ...slot, state: values[n] === true ? "hit" : values[n] === false ? "waiting" : "unjudged" } : slot);
      add({ id: m.id, label: m.id === "PTBV" ? "P/TBV" : "역DCF", stages: slots(state.down), sellStages: slots(state.up) });
    }
  }
  instruments.forEach((instrument, index) => {
    const groups = new Map<string, HoldingStageRow>();
    const { conditions } = watchConditionStates(instrument, quotes[watchQuoteSymbol(instrument)], now);
    for (const { condition: c, state } of conditions) {
      const m = method(c);
      const row = groups.get(m.id) ?? { ...m, stages: [], sellStages: [] };
      const side = c.direction === "lte" ? row.stages : row.sellStages;
      const named = /^[AB]$/.test(c.id);
      const explicit = c.label.match(/([123])\s*차/)?.[1] ?? c.id.match(/(?:^|[-_])(?:stage|low|high|up|sell)[-_]?([123])$/i)?.[1];
      side.push({ id: `${index}:${c.id}`, label: named ? c.id : explicit ? `${explicit}차` : `${side.length + 1}차`, state });
      groups.set(m.id, row);
    }
    for (const row of groups.values()) {
      for (const key of ["stages", "sellStages"] as const) {
        if (row[key].some(s => /^[AB]$/.test(s.label))) continue;
        const actual = row[key];
        row[key] = missing().map(slot => actual.find(s => s.label === slot.label) ?? slot);
        row[key].push(...actual.filter(s => !row[key].some(slot => slot.id === s.id)));
      }
      add(row);
    }
  });
  return rows;
}
