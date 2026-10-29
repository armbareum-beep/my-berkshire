import { useEffect, useState } from "react";
import type { Portfolio } from "@/lib/family/model";
import { holdingValuationState } from "@/lib/family/holding-valuation";
import { watchesForSymbol } from "@/lib/family/valuation-alerts";

const labels = { hit: "저평가 구간", waiting: "저평가 미도달", pending: "저평가 판단 대기", unregistered: "저평가 기준 없음" };

export default function HoldingValuationStatus({ data, code, price }: { data: Portfolio; code: string; price: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const state = holdingValuationState({ basis: data.valuationAlerts?.[code], price, marketTime: data.quoteMarketTimes?.[code], instruments: watchesForSymbol(data.priceWatchConnections, code).map(w => w.instrument), quotes: data.rawQuotes, now });
  return <small className={`holding-valuation-status ${state}`}>{labels[state]}</small>;
}
