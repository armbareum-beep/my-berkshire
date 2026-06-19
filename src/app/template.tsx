/**
 * 라우트 전환 시 살짝 떠오르며 페이드인(토스식 부드러운 화면 전환).
 * template 은 네비게이션마다 새로 마운트돼 매번 진입 애니메이션이 재생된다.
 * 모션은 CSS(.animate-page-in) — prefers-reduced-motion 이면 무효.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
