import { alertStages, readAlertBasis, watchConditionStates, watchQuoteSymbol, type NativeQuote, type PriceWatchInstrument } from "./valuation-alerts";

/** Summarize existing low-price conditions only; never treat unknown data as a non-hit. */
export function holdingValuationState({ basis: input, price, marketTime, instruments, quotes = {}, now = Date.now() }: {
  basis: unknown;
  price: number | null;
  marketTime?: number;
  instruments: PriceWatchInstrument[];
  quotes?: Record<string, NativeQuote>;
  now?: number;
}): "hit" | "waiting" | "pending" | "unregistered" {
  const states: (boolean | null)[] = [];
  if (input !== undefined) {
    const basis = readAlertBasis(input);
    if (!basis) states.push(null);
    else for (const method of basis.methods) states.push(...alertStages(method, price, marketTime, now).down);
  }
  for (const instrument of instruments) {
    if (!instrument.conditions.length && instrument.status === "pending") states.push(null);
    const { conditions } = watchConditionStates(instrument, quotes[watchQuoteSymbol(instrument)], now);
    for (const { condition, state } of conditions) {
      if (condition.direction !== "lte") continue;
      states.push(state === "hit" ? true : state === "waiting" ? false : null);
    }
  }
  if (states.some(state => state === true)) return "hit";
  if (states.some(state => state === null)) return "pending";
  return states.length ? "waiting" : "unregistered";
}
