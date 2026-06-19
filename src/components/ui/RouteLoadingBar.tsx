export default function RouteLoadingBar({
  label = "페이지 불러오는 중",
}: {
  label?: string;
}) {
  return (
    <div
      className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-secondary"
      aria-label={label}
      aria-busy="true"
    >
      <div className="h-full w-1/3 animate-pulse bg-primary" />
    </div>
  );
}
