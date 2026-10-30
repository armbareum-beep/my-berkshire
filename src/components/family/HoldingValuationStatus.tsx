import { useEffect, useState } from "react";
import type { Portfolio } from "@/lib/family/model";
import { holdingValuationRows, type StageState } from "@/lib/family/holding-valuation-stages";
import { watchesForSymbol } from "@/lib/family/valuation-alerts";

const names: Record<StageState, string> = { hit: "도달", waiting: "미도달", pending: "검증 대기", unjudged: "판단 대기", unregistered: "기준 미설정" };
const marks: Record<StageState, string> = { hit: "✓", waiting: "", pending: "?", unjudged: "?", unregistered: "—" };

export default function HoldingValuationStatus({ data, code, price }: { data: Portfolio; code: string; price: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const rows = holdingValuationRows({ basis: data.valuationAlerts?.[code], price, marketTime: data.quoteMarketTimes?.[code], instruments: watchesForSymbol(data.priceWatchConnections, code).map(w => w.instrument), quotes: data.rawQuotes, now });
  return <div className="holding-valuation-stages" aria-label="매수·매도 단계별 도달 여부">{rows.map(row => <div className="hv-row" key={row.id}>
    <span className="hv-method">{row.label}</span>
    <div className="hv-sides">{([{ key: "down", label: "매수", stages: row.stages }, { key: "up", label: "매도", stages: row.sellStages }] as const).map(side => <div className={`hv-side ${side.key}`} key={side.key}>
      <span className="hv-side-label">{side.label}</span>
      <span className="hv-levels">{side.stages.map(stage => <span key={stage.id} className={`hv-level ${stage.state}`} title={`${row.label} ${side.label} ${stage.label} ${names[stage.state]}`} aria-label={`${row.label} ${side.label} ${stage.label} ${names[stage.state]}`}>{stage.label}<b>{marks[stage.state]}</b></span>)}</span>
      {side.stages.every(s => s.state === "unregistered") && <small className="hv-note">미설정</small>}
    </div>)}</div>
  </div>)}</div>;
}
