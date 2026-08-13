import { redirect } from "next/navigation";

/**
 * 배분 여정은 `/allocate` 레일 안으로 들어갔다 — 금액·결과·주수가 한 화면의 세 단계다.
 * 별도 화면으로 두면 "첫 화면은 답을 안 주고 한 번 더 들어가야 하는" 구조가 되돌아온다.
 * 저장해둔 링크가 죽지 않게 리다이렉트만 남긴다.
 */
export default function AllocatePlanRedirectPage() {
  redirect("/allocate");
}
