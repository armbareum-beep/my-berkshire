import { Lock } from "lucide-react";

export function LiveTabPlaceholder() {
  return (
    <div className="rounded-2xl bg-card p-8 shadow-card flex flex-col items-center gap-3 text-center">
      <Lock size={28} className="text-muted-foreground" />
      <p className="font-semibold">증권사 연동 후 공개 예정</p>
      <p className="text-sm text-muted-foreground">
        라이브 모드는 실제 증권사 계좌와 연동된 검증된 수익률로 순위를 겨루는 리그예요.
        준비되면 알려드릴게요.
      </p>
    </div>
  );
}
