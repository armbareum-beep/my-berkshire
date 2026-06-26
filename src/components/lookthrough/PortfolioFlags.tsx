import Link from "next/link";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  TriangleAlertIcon,
  LightbulbIcon,
} from "lucide-react";
import type { PortfolioFlagGroup } from "@/lib/finance/fundamentalFlags";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";

/** 접기 전에 펼쳐 보일 사업부 수. 이보다 많으면 나머지는 "더 보기"로 접는다. */
const VISIBLE_GROUPS = 1;

/** 한 자회사(종목 그룹) — 통째로 /stocks 재무제표 링크. 신호는 톤별 컬러 바 + 근거 칩. */
function FlagGroup({ g }: { g: PortfolioFlagGroup }) {
  return (
    <li>
      <Link
        href={`/stocks/${encodeURIComponent(g.symbol)}?name=${encodeURIComponent(g.name)}&view=financials#financials`}
        className="block rounded-xl p-2 transition active:scale-[0.99] hover:bg-secondary"
      >
        <div className="mb-1.5 flex items-center gap-2">
          <SymbolAvatar name={g.name} symbol={g.symbol} />
          <span className="flex-1 text-sm font-semibold">{g.name}</span>
          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-secondary-foreground">
            {g.flags.length}
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </div>
        <ul className="flex flex-col gap-1.5">
          {g.flags.map((f) => {
            const warn = f.tone === "warn";
            return (
              <li
                key={f.id}
                className={`rounded-lg border-l-2 py-1.5 pl-2.5 pr-2 ${
                  warn ? "border-warn bg-warn-tint" : "border-primary bg-accent"
                }`}
              >
                <p className="flex items-start gap-1.5 text-[13px] font-semibold">
                  {warn ? (
                    <TriangleAlertIcon className="mt-px size-3.5 shrink-0 text-warn" />
                  ) : (
                    <LightbulbIcon className="mt-px size-3.5 shrink-0 text-primary" />
                  )}
                  <span className="text-foreground">{f.title}</span>
                </p>
                {f.evidence && f.evidence.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 pl-5">
                    {f.evidence.map((e) => (
                      <span
                        key={e.label}
                        className="rounded-md bg-card px-1.5 py-0.5 text-[11px] font-medium tabular-nums shadow-card"
                      >
                        <span className="text-muted-foreground">{e.label}</span>{" "}
                        {e.value}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 pl-5 text-[11px] leading-relaxed text-muted-foreground">
                  {f.question}
                </p>
              </li>
            );
          })}
        </ul>
      </Link>
    </li>
  );
}

/**
 * 지주회사 전체 재무 신호 — 보유 사업부별 펀더멘털 플래그 요약(PRD §8-2 투시 상세).
 * "CEO가 자회사들의 확인거리를 한눈에." 단정 아님 — 신호 + 질문 + 근거, 판단은 회장 몫.
 * 확인거리가 하나도 없으면 카드 자체를 렌더하지 않는다(빈 안내문도 노이즈).
 *
 * 길이 제어(B안): 신호 성격상 가로 캐러셀(놓치면 못 봄) 대신 세로 리스트로 다 보여주되,
 * 사업부가 VISIBLE_GROUPS 보다 많으면 나머지는 <details> "더 보기"로 접는다(JS 없이).
 */
export function PortfolioFlags({ groups }: { groups: PortfolioFlagGroup[] }) {
  const total = groups.reduce((n, g) => n + g.flags.length, 0);
  // 확인거리가 없으면 카드를 통째로 숨긴다(빈 상태 문구 대신 아예 미표시).
  if (total === 0) return null;

  const visible = groups.slice(0, VISIBLE_GROUPS);
  const rest = groups.slice(VISIBLE_GROUPS);
  const restFlags = rest.reduce((n, g) => n + g.flags.length, 0);

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">내 지분 재무 신호</p>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
          확인거리 {total}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        자회사 재무제표가 던지는 질문 — 확인할 거리예요(단정 아님).
      </p>

      <ul className="flex flex-col gap-2.5">
        {visible.map((g) => (
          <FlagGroup key={g.symbol} g={g} />
        ))}
      </ul>

      {rest.length > 0 && (
        <details className="group mt-2.5">
          <summary className="flex cursor-pointer list-none items-center justify-center gap-1 rounded-xl bg-secondary py-2 text-xs font-semibold text-secondary-foreground transition hover:brightness-95 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              확인거리 {restFlags}개 더 · 사업부 {rest.length}곳
            </span>
            <span className="hidden group-open:inline">접기</span>
            <ChevronDownIcon className="size-4 transition group-open:rotate-180" />
          </summary>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {rest.map((g) => (
              <FlagGroup key={g.symbol} g={g} />
            ))}
          </ul>
        </details>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        규칙 기반 해석(단정 아님) · 최신·직전 연도 비교 · 한국·미국 주식만. 종목을 누르면 자세히 봐요.
      </p>
    </section>
  );
}
