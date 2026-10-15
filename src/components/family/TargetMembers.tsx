import { partLabel, productKind, targetMembers } from "@/lib/family/breakdown";
import { summarize, type Portfolio } from "@/lib/family/model";

const won = (n: number) => Math.round(n).toLocaleString("ko-KR") + "원";
const share = (v: number, total: number) => total > 0 ? (v / total * 100).toFixed(1) + "%" : "—";
const currencyNames: Record<string, string> = { KRW: "원화", USD: "달러", JPY: "엔화", CNY: "위안화", HKD: "홍콩달러", EUR: "유로" };
const kindNames = { stock: "개별 주식", etf: "ETF", deposit: "예금", bond: "채권", cash: "외화" };

/** The holdings behind one row of the 국가별 비중 card, each weighed against all assets. */
export default function TargetMembers({ data, s, group }: { data: Portfolio; s: ReturnType<typeof summarize>; group: number }) {
  const { members, cash } = targetMembers(data, s, group);
  const items = [...members.map(({ row, bucket }) => ({ key: bucket + row.code, name: row.name, tag: row.part < 1 ? partLabel(data, row, bucket) : "", kind: kindNames[productKind(data.products[row.code])], value: row.value! })),
    ...cash.map(([currency, value]) => ({ key: "cash" + currency, name: `계좌 현금 · ${currencyNames[currency] || currency}`, tag: "", kind: "CMA·예수금", value }))].sort((a, b) => b.value - a.value);
  if (!items.length) return <p className="tb-members-empty">보유한 종목이 없어요.</p>;
  return <ul className="tb-members">{items.map(m => <li key={m.key}>
    <span><b>{m.name}</b>{m.tag && <em className="part-tag">{m.tag}</em>}<small>{m.kind}</small></span>
    <span><b>{share(m.value, s.nav)}</b><small>{won(m.value)}</small></span>
  </li>)}</ul>;
}
