import { redirect } from "next/navigation";

/**
 * 배분 설정은 레일 안으로 들어갔다.
 *
 * 목표 정하기 / 금액 넣기 / 배분 설정이 각각 다른 화면이라 사용자가 셋을 오가야 했다 —
 * *"3가지 층을 합할 수 없냐."* 셋은 원래 한 흐름이다.
 *
 *   · 투자 가능 현금 → 레일 2단계(금액). 그 단계의 기본값이 곧 이 값이다
 *   · 허들(요구수익률) → 레일 4단계(배분 결과). 이 값이 그 순위를 만든다
 *
 * 옛 링크가 죽지 않게 리다이렉트만 남긴다.
 */
export default function SettingsRedirect() {
  redirect("/allocate");
}
