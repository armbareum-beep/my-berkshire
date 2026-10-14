import { useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { holdingReturns, sortHoldings, type HoldingFilter, type HoldingSort } from "@/lib/family/breakdown";
import { summarize, type Portfolio } from "@/lib/family/model";

const won = (n: number) => Math.round(n).toLocaleString("ko-KR") + "원";
const signed = (n: number | null) => n === null ? "미평가" : (n >= 0 ? "+" : "−") + won(Math.abs(n));
const rate = (n: number | null) => n === null ? "—" : (n > 0 ? "+" : "") + (n * 100).toFixed(1) + "%";
const share = (v: number, total: number) => total > 0 ? (v / total * 100).toFixed(1) + "%" : "—";
const currencyUnits: Record<string, string> = { JPY: "엔", USD: "달러", CNY: "위안", EUR: "유로", HKD: "홍콩달러" };
const filters: [HoldingFilter, string][] = [["stock", "개별 주식"], ["etf", "ETF"], ["all", "전체"]];
const sortOptions: [HoldingSort, string][] = [["rate", "수익률"], ["profit", "수익금"], ["value", "평가액"]];

/** Holdings merged across the selected accounts; individual stocks first. */
export default function Holdings({ data, owner, account, broker, group }: { data: Portfolio; owner: string; account: string; broker: string; group: string }) {
  const [filter, setFilter] = useState<HoldingFilter>("stock"), [sortKey, setSortKey] = useState<HoldingSort>("rate"), [descending, setDescending] = useState(true);
  const s = summarize(data, owner, account, broker, group), r = holdingReturns(data, s, filter), rows = sortHoldings(r.rows, sortKey, descending);
  /** Weights within the chosen kind; the whole list is weighed against all assets, cash included. */
  const base = filter === "all" ? s.nav : r.value;
  const ownerName = (id: string) => data.owners.find(o => o.id === id)?.name || "가족";
  const accountOf = (id: string) => data.accounts.find(a => a.id === id);
  const unit = (code: string) => { const p = data.products[code]; return p.kind === "cash" ? (currencyUnits[p.currency!] || " " + p.currency) : "주"; };
  /** Foreign cash is quoted like a bank rate: 원 per 100엔, 원 per 1달러. */
  const unitPrice = (code: string, krw: number) => { const p = data.products[code]; if (p.kind !== "cash") return won(krw); const per = p.currency === "JPY" ? 100 : 1; return (krw * per).toLocaleString("ko-KR", { maximumFractionDigits: 2 }) + "원/" + (per === 100 ? "100" : "") + unit(code).trim(); };
  const label = filters.find(([id]) => id === filter)![1];
  return <section className="surface holdings">
    <div className="section-title"><h2>보유종목 <em>{rows.length}</em></h2><span>{data.checkedAt ? `시세 조회 ${new Date(data.checkedAt).toLocaleString("ko-KR")}` : "파일 기준가격 · 실시간 아님"}</span></div>
    <div className="segmented holding-filter" role="group" aria-label="종류">{filters.map(([id, name]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{name}</button>)}</div>
    <div className="performance-grid">
      <div className="performance-own"><span>{label} 수익률</span><strong className={(r.rate ?? 0) < 0 ? "negative" : "positive"}>{rate(r.rate)}</strong><small>평가손익 {signed(r.profit)}</small></div>
      <div><span>평가액</span><strong>{won(r.value)}</strong><small>전체 자산의 {share(r.value, s.nav)}</small></div>
      <div><span>매입원가</span><strong>{won(r.cost)}</strong><small>{r.unpriced ? `가격 없는 ${r.unpriced}종목 제외` : "보유 중인 종목 기준"}</small></div>
    </div>
    <div className="holding-sort"><div className="segmented" role="group" aria-label="정렬 기준">{sortOptions.map(([id, name]) => <button key={id} aria-pressed={sortKey === id} onClick={() => setSortKey(id)}>{name}</button>)}</div><button className="sort-direction" onClick={() => setDescending(!descending)}>{descending ? <ArrowDownWideNarrow size={15} /> : <ArrowUpNarrowWide size={15} />}{descending ? "높은순" : "낮은순"}</button></div>
    <div className="table-wrap"><table><thead><tr><th>종목 / 계좌</th><th>보유수량</th><th>평가액</th><th>수익금 / 수익률</th><th>비중</th></tr></thead><tbody>{rows.map(h => {
      const owners = [...new Set(h.accounts.map(id => ownerName(accountOf(id)!.owner)))];
      return <tr key={h.code}>
        <td><strong>{h.name}</strong><small>{h.accounts.length === 1 ? `${owners[0]} · ${accountOf(h.accounts[0])!.name}` : `${h.accounts.length}개 계좌 · ${owners.join(", ")}`} · {h.code}</small></td>
        <td>{h.quantity.toLocaleString("ko-KR")}{unit(h.code)}<small>평균 {unitPrice(h.code, h.cost / h.quantity)}</small></td>
        <td><strong>{h.value === null ? "가격 필요" : won(h.value)}</strong><small><span className="wide-only">{h.price === null ? "—" : "현재가 " + unitPrice(h.code, h.price)}</span><span className="narrow-only">{h.value === null ? "—" : "비중 " + share(h.value, base)}</span></small></td>
        <td className={(h.profit ?? 0) < 0 ? "negative" : "positive"}>{signed(h.profit)}<small>{rate(h.rate)}</small></td>
        <td className="weight">{h.value === null ? "—" : <><strong>{share(h.value, base)}</strong><i aria-hidden="true"><b style={{ width: `${base > 0 ? Math.min(100, Math.max(0, h.value / base * 100)) : 0}%` }} /></i></>}</td>
      </tr>;
    })}</tbody></table></div>
    {!rows.length && <p className="fine">선택한 범위에 {filter === "all" ? "보유종목이" : filter === "etf" ? "ETF가" : "개별 주식이"} 없어요.</p>}
  </section>;
}
