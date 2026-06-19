/**
 * 네비게이션 즉시 피드백용 스켈레톤 — 각 라우트의 loading.tsx 가 공통으로 사용.
 * 탭을 누르면 Next 가 이 fallback 을 **즉시** 그리고, 실제 페이지(동적 서버 렌더)는
 * 뒤따라 스트리밍해 끼워 넣는다 → "메뉴 누르면 멈춘다" 체감 제거. 데이터 패칭은 안 함(순수 표시).
 */
export default function PageSkeleton() {
  return (
    <main
      className="flex min-h-dvh flex-col gap-4 p-6 pb-28"
      aria-busy="true"
      aria-label="불러오는 중"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-28 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-20 animate-pulse rounded bg-secondary" />
        </div>
        <div className="h-8 w-16 animate-pulse rounded-full bg-secondary" />
      </div>

      {/* 히어로 카드 */}
      <div className="rounded-2xl bg-card p-6 shadow-card">
        <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
        <div className="mt-3 h-9 w-44 animate-pulse rounded bg-secondary" />
        <div className="mt-3 h-3 w-32 animate-pulse rounded bg-secondary" />
      </div>

      {/* 카드 자리 */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl bg-card p-5 shadow-card">
          <div className="h-4 w-24 animate-pulse rounded bg-secondary" />
          <div className="mt-3 h-7 w-36 animate-pulse rounded bg-secondary" />
        </div>
      ))}
    </main>
  );
}
