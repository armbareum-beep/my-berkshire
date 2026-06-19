import { redirect } from "next/navigation";

/** /pnl 은 /returns(수익률)로 통합됨 — 실현·미실현 손익이 거기 있음. */
export default function PnlPage() {
  redirect("/returns");
}
