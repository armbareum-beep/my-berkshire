import { Check, AlertTriangle, Lightbulb } from "lucide-react";
import type { FundamentalFlag } from "@/lib/finance/fundamentalFlags";

export interface HealthCheck {
  label: string;
  pass: boolean | null;
  detail: string;
}

/**
 * 재무 건강 체크 + 펀더멘털 플래그(§11) 통합 블록.
 *   · 체크리스트 = 현재 상태가 보편 기준을 넘느냐(흑자·이익의 질·이자체력·성장·현금흐름). 합격/불합격.
 *   · 플래그 = 작년 대비 변화·괴리에서 나오는 "확인할 거리"(밀어내기·떨이·일회성 이익 등).
 * 둘 다 "살 종목이냐"가 아니라 "재무가 튼튼하냐 / 이익이 진짜냐". 단정 아님 — 판단은 회장 몫.
 * 순수 표시 컴포넌트(서버). "재무제표 자세히" 최상단에 둔다.
 */
export function FinancialHealth({
  checks,
  pass,
  total,
  flags,
}: {
  checks: HealthCheck[];
  pass: number;
  total: number;
  flags: FundamentalFlag[];
}) {
  return (
    <div className="rounded-xl bg-secondary p-3">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>재무 건강 체크</span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          {pass}/{total}
          {pass === total && <Check size={14} className="text-foreground" />}
        </span>
      </div>
      <ul className="mt-2 space-y-1 text-xs">
        {checks.map((h) => (
          <li key={h.label} className="flex items-center justify-between gap-2">
            <span>
              {/* 통과=잉크 체크(중립), 미달=경고 앰버. 등락 빨강/파랑은 시세에만(§색 규칙). */}
              <span
                className={
                  h.pass === true
                    ? "font-semibold text-foreground"
                    : h.pass === false
                      ? "font-semibold text-warn"
                      : "text-muted-foreground"
                }
              >
                {h.pass === true ? "✓" : h.pass === false ? "✗" : "—"}
              </span>{" "}
              {h.label}
            </span>
            <span className="text-muted-foreground">{h.detail}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        살 종목인지가 아니라 재무가 튼튼한지 봐요(스타일 무관).
      </p>

      {flags.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold">
            <AlertTriangle size={13} className="text-warn" /> 확인할 거리
          </p>
          <ul className="flex flex-col gap-2.5">
            {flags.map((f) => (
              <li
                key={f.id}
                className="rounded-lg border border-border bg-card px-3 py-2"
              >
                <p className="flex items-start gap-1.5 text-xs font-medium">
                  {f.tone === "warn" ? (
                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" />
                  ) : (
                    <Lightbulb size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    style={
                      f.tone === "warn" ? { color: "var(--warn)" } : undefined
                    }
                  >
                    {f.title}
                  </span>
                </p>
                {f.evidence && f.evidence.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 pl-5">
                    {f.evidence.map((e) => (
                      <span
                        key={e.label}
                        className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
                      >
                        <span className="text-muted-foreground">{e.label}</span>{" "}
                        {e.value}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 pl-5 text-[11px] text-muted-foreground">
                  {f.question}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">
            재무제표가 던지는 질문 — 규칙 기반 해석(단정 아님), 최신·직전 연도 비교.
          </p>
        </div>
      )}
    </div>
  );
}
