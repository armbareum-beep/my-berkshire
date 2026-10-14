import { useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { sortHoldings, stockReturns, type HoldingSort } from "@/lib/family/breakdown";
import { summarize, type Portfolio } from "@/lib/family/model";

const won = (n: number) => Math.round(n).toLocaleString("ko-KR") + "원";
const signed = (n: number | null) => n === null ? "미평가" : (n >= 0 ? "+" : "−") + won(Math.abs(n));
const rate = (n: number | null) => n === null ? "—" : (n > 0 ? "+" : "") + (n * 100).toFixed(1) + "%";
const sortOptions: [HoldingSort, string][] = [["rate", "수익률"], ["profit", "수익금"], ["value", "평가액"]];

/** Individual stocks only, merged across the selected accounts. */
export default function StockReturns({ data, owner, account, broker, group }: { data: Portfolio; owner: string; account: string; broker: string; group: string }) {
  const [sortKey, setSortKey] = useState<HoldingSort>("rate"), [descending, setDescending] = useState(true);
  const s = summarize(data, owner, account, broker, group), r = stockReturns(data, s), rows = sortHoldings(r.rows, sortKey, descending);
  const ownerName = (id: string) => data.owners.find(o => o.id === id)?.name || "가족";
  const accountOf = (id: string) => data.accounts.find(a => a.id === id);
  return <section className="surface holdings">
    <div className="section-title"><h2>종목별 수익률 <em>{rows.length}</em></h2><span>{data.checkedAt ? `시세 조회 ${new Date(data.checkedAt).toLocaleString("ko-KR")}` : "파일 기준가격 · 실시간 아님"}</span></div>
    <div className="performance-grid">
      <div className="performance-own"><span>개별 주식 수익률</span><strong className={(r.rate ?? 0) < 0 ? "negative" : "positive"}>{rate(r.rate)}</strong><small>평가손익 {signed(r.profit)}</small></div>
      <div><span>평가액</span><strong>{won(r.value)}</strong><small>전체 자산의 {s.nav > 0 ? (r.value / s.nav * 100).toFixed(1) + "%" : "—"}</small></div>
      <div><span>매입원가</span><strong>{won(r.cost)}</strong><small>{r.unpriced ? `가격 없는 ${r.unpriced}종목 제외` : "보유 중인 종목 기준"}</small></div>
    </div>
    <div className="holding-sort"><div className="segmented" role="group" aria-label="정렬 기준">{sortOptions.map(([id, label]) => <button key={id} aria-pressed={sortKey === id} onClick={() => setSortKey(id)}>{label}</button>)}</div><button className="sort-direction" onClick={() => setDescending(!descending)}>{descending ? <ArrowDownWideNarrow size={15} /> : <ArrowUpNarrowWide size={15} />}{descending ? "높은순" : "낮은순"}</button></div>
    <div className="table-wrap"><table><thead><tr><th>종목 / 계좌</th><th>보유수량</th><th>평가액</th><th>수익금 / 수익률</th><th>비중</th></tr></thead><tbody>{rows.map(h => {
      const owners = [...new Set(h.accounts.map(id => ownerName(accountOf(id)!.owner)))];
      return <tr key={h.code}>
        <td><strong>{h.name}</strong><small>{h.accounts.length === 1 ? `${owners[0]} · ${accountOf(h.accounts[0])!.name}` : `${h.accounts.length}개 계좌 · ${owners.join(", ")}`} · {h.code}</small></td>
        <td>{h.quantity.toLocaleString("ko-KR")}주<small>평균 {won(h.cost / h.quantity)}</small></td>
        <td><strong>{h.value === null ? "가격 필요" : won(h.value)}</strong><small><span className="wide-only">{h.price === null ? "—" : "현재가 " + won(h.price)}</span><span className="narrow-only">{h.value === null || r.value <= 0 ? "—" : "비중 " + (h.value / r.value * 100).toFixed(1) + "%"}</span></small></td>
        <td className={(h.profit ?? 0) < 0 ? "negative" : "positive"}>{signed(h.profit)}<small>{rate(h.rate)}</small></td>
        <td className="weight">{h.value === null ? "—" : <><strong>{r.value > 0 ? (h.value / r.value * 100).toFixed(1) + "%" : "—"}</strong><i aria-hidden="true"><b style={{ width: `${r.value > 0 ? Math.min(100, Math.max(0, h.value / r.value * 100)) : 0}%` }} /></i></>}</td>
      </tr>;
    })}</tbody></table></div>
    {!rows.length && <p className="fine">선택한 범위에 개별 주식이 없어요.</p>}
    <p className="fine">ETF·채권·예금·현금을 빼고 개별 주식만 보여줘요. 같은 종목은 계좌가 달라도 합치며, 수익률은 지금 보유 중인 수량의 평가손익 ÷ 매입원가입니다. 이미 판 종목의 실현손익과 배당은 포함하지 않아요. 비중은 개별 주식 평가액 합계 대비입니다.</p>
  </section>;
}
