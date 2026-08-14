import { redirect } from "next/navigation";

/**
 * 종목별 조회는 드릴다운 안으로 들어갔다 — 전체 자산 → 금융자산 → 주식.
 * 목표비중은 계층 안에서 정한다(`+ 종목 추가`). 옛 링크가 죽지 않게 리다이렉트만 남긴다.
 */
export default function StockAllocationRedirect() {
  redirect("/allocation/financial/%EC%A3%BC%EC%8B%9D");
}
