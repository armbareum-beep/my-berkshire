import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { partLabel, productKind, targetMembers } from "@/lib/family/breakdown";
import { summarize, type Portfolio } from "@/lib/family/model";
import ValuationStages from "./ValuationStages";

const won = (n: number) => Math.round(n).toLocaleString("ko-KR") + "원";
const share = (v: number, total: number) => total > 0 ? (v / total * 100).toFixed(1) + "%" : "—";
/** Profit and return on cost, e.g. +1,200,000원 · +12.3%; nothing for cash or unpriced rows. */
function Gain({ profit, cost }: { profit: number | null; cost: number }) {
  if (profit === null || cost <= 0) return null;
  return <small className={profit < 0 ? "negative" : "positive"}>{(profit >= 0 ? "+" : "−") + won(Math.abs(profit))} · {(profit >= 0 ? "+" : "") + (profit / cost * 100).toFixed(1)}%</small>;
}
const currencyNames: Record<string, string> = { KRW: "원화", USD: "달러", JPY: "엔화", CNY: "위안화", HKD: "홍콩달러", EUR: "유로" };
const kindNames = { stock: "개별 주식", etf: "ETF", deposit: "예금", bond: "채권", cash: "외화" };
/** Sub-groups in display order: countries split ETF / 개별 주식, gold splits ETF / 현물, the last group splits cash, bonds and other equity. */
const subNames = [["ETF", "개별 주식"], ["ETF", "개별 주식"], ["ETF", "개별 주식"], ["ETF", "현물·기타"], ["현금", "채권·예금", "그 밖의 나라 주식"]];

/** The holdings behind one row of the 국가별 비중 card, grouped by kind; each sub-group opens to its items. Weights are within the level above, so each level adds up to 100%. */
export default function TargetMembers({ data, s, group }: { data: Portfolio; s: ReturnType<typeof summarize>; group: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const { members, cash } = targetMembers(data, s, group);
  const items = [...members.map(({ row, bucket }) => {
    const kind = productKind(data.products[row.code]);
    const sub = group < 3 ? (kind === "etf" ? "ETF" : "개별 주식") : group === 3 ? (kind === "etf" ? "ETF" : "현물·기타") : bucket === 3 ? "그 밖의 나라 주식" : kind === "cash" ? "현금" : "채권·예금";
    return { key: bucket + row.code, code: row.code, price: row.price, isStock: kind === "stock", sub, name: row.name, tag: row.part < 1 ? partLabel(data, row, bucket) : "", kind: kindNames[kind], value: row.value!, profit: row.profit, cost: row.cost };
  }), ...cash.map(([currency, value]) => ({ key: "cash" + currency, code: "", price: null, isStock: false, sub: "현금", name: `계좌 현금 · ${currencyNames[currency] || currency}`, tag: "", kind: "CMA·예수금", value, profit: null as number | null, cost: 0 }))];
  const subs = subNames[group].map(name => { const list = items.filter(m => m.sub === name).sort((a, b) => b.value - a.value); const gains = list.filter(m => m.profit !== null); return { name, list, value: list.reduce((t, m) => t + m.value, 0), profit: gains.length ? gains.reduce((t, m) => t + m.profit!, 0) : null, cost: gains.reduce((t, m) => t + m.cost, 0) }; }).filter(g => g.list.length);
  const total = subs.reduce((t, g) => t + g.value, 0);
  if (!subs.length) return <p className="tb-members-empty">보유한 종목이 없어요.</p>;
  return <ul className="tb-members">{subs.map(g => {
    const expanded = open === g.name, toggle = () => setOpen(expanded ? null : g.name);
    return <li key={g.name} className={expanded ? "tb-sub open" : "tb-sub"}>
      <div className="tb-sub-head" role="button" tabIndex={0} aria-expanded={expanded} onClick={toggle} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}>
        <span><b>{g.name}<ChevronRight className="tb-chevron" size={14} aria-hidden="true" /></b><small>{g.list.length}개</small></span>
        <span><b>{share(g.value, total)}</b><small>{won(g.value)}</small><Gain profit={g.profit} cost={g.cost} /></span>
      </div>
      {expanded && <ul className="tb-items">{g.list.map(m => <li key={m.key}>
        <div className="tb-item-main">
        <span><b>{m.name}</b>{m.tag && <em className="part-tag">{m.tag}</em>}{m.kind !== g.name && <small>{m.kind}</small>}</span>
        <span><b>{share(m.value, g.value)}</b><small>{won(m.value)}</small><Gain profit={m.profit} cost={m.cost} /></span>
        </div>
        {m.isStock && <ValuationStages basis={data.valuationAlerts?.[m.code]} price={m.price} marketTime={data.quoteMarketTimes?.[m.code]} />}
      </li>)}</ul>}
    </li>;
  })}</ul>;
}
