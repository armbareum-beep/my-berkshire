import type { StyleResult, StyleDimension } from "@/lib/style";
import { CountUp } from "@/components/ui/CountUp";
import { EmojiIcon } from "@/components/ui/EmojiIcon";
import type { StyleHistorySnapshot } from "@/lib/styleHistory";

/** 규율 점수 구성요소 코칭(보편 규율 — 스타일 무관). */
const SUB_HINT: Record<string, string> = {
  lowCost: "수수료·세금은 확정 손실이에요. 가치든 성장이든 낮을수록 좋아요.",
  lowLeverage: "빚이 적을수록 시장 충격에 강해요. 무차입이 가장 단단해요.",
  plan: "세운 자본배분 계획을 지킬수록 올라가요.",
};

/** 중립 프로파일 설명(우열 아님 — 스타일 묘사). */
const DIM_HINT: Record<string, string> = {
  longTerm: "보유기간과 매매 빈도를 함께 봅니다.",
  concentration: "최대 사업부 비중과 보유 사업부 수를 함께 봅니다.",
  income: "받은 배당을 관측기간에 맞춰 연환산합니다.",
  defensive: "현재 현금 비중으로 기회 대응 여력을 봅니다.",
  global: "해외 사업부가 차지하는 비중입니다.",
  index: "ETF로 보유한 자산 비중입니다.",
  innovation: "기술·반도체·소프트웨어·바이오 섹터 비중입니다.",
};

function Bar({ dim, hint }: { dim: StyleDimension; hint?: string }) {
  const isSpectrum = dim.lowLabel != null && dim.highLabel != null;
  const unavailable = dim.available === false;
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <span className="w-16 shrink-0 text-sm font-medium">{dim.label}</span>
        <span className="relative h-2 flex-1 rounded-full bg-secondary">
          {isSpectrum ? (
            !unavailable && (
              <span
                className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow-sm"
                style={{ left: `${Math.round(dim.score * 100)}%` }}
              />
            )
          ) : (
            <span
              className="block h-2 rounded-full bg-primary"
              style={{ width: `${Math.round(dim.score * 100)}%` }}
            />
          )}
        </span>
        <span className="w-20 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
          {dim.display}
        </span>
      </div>
      {isSpectrum && (
        <div className="flex justify-between pl-[4.75rem] pr-20 text-[11px] text-muted-foreground">
          <span>{dim.lowLabel}</span>
          <span>{dim.highLabel}</span>
        </div>
      )}
      {hint && <p className="pl-[4.75rem] text-xs text-muted-foreground">{hint}</p>}
    </li>
  );
}

/**
 * 운용 스타일 + 투자 규율 점수 상세.
 *  · 점수 = 스타일 중립(저비용·저레버리지·계획준수) — 가치·성장 누구에게나 공정.
 *  · 스타일 = 우열 없는 "거울"(아키타입 + 프로파일).
 */
export function StyleDetail({
  style,
  previousStyle,
}: {
  style: StyleResult;
  previousStyle: StyleHistorySnapshot | null;
}) {
  if (style.insufficient) {
    return (
      <section className="rounded-2xl bg-card p-6 text-center shadow-card">
        <div className="flex justify-center text-muted-foreground">
          <EmojiIcon emoji={style.emoji} size={36} />
        </div>
        <p className="mt-2 font-bold">{style.label}</p>
        <p className="mt-1 text-sm text-muted-foreground">{style.tagline}</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 규율 점수 히어로 — 표면은 항상 흰 카드(§무채색). 등급은 emoji·라벨로 표시(면 채움 X). */}
      {style.score != null && style.grade != null && (
        <section className="rounded-2xl bg-card p-6 shadow-card">
          <p className="text-sm font-medium text-muted-foreground">
            투자 규율 점수
          </p>
          <div className="mt-1 flex items-end gap-3">
            <CountUp
              value={style.score}
              format="plain"
              className="text-5xl font-extrabold tracking-tight"
            />
            <span className="mb-1 inline-flex items-center gap-1 text-lg font-bold">
              <EmojiIcon emoji={style.grade.emoji} size={18} />
              {style.grade.label}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            점수는 <b>스타일이 아니라 비용·리스크 규율</b>만 봐요. 가치든 성장이든,
            수수료를 아끼고 빚을 관리하면 점수가 올라가요.
          </p>

          <ul className="mt-4 flex flex-col gap-3 border-t border-border/50 pt-4">
            {style.subScores.map((s) => (
              <Bar key={s.key} dim={s} hint={SUB_HINT[s.key]} />
            ))}
          </ul>
        </section>
      )}

      {/* 경고(보편 악 = 高비용일 때만) — 경고는 앰버(--warn), 파랑 틴트 금지(§색 규칙). */}
      {style.warning && (
        <p className="flex items-center gap-1.5 rounded-xl bg-warn-tint px-4 py-3 text-sm text-warn">
          <EmojiIcon emoji="⚠️" size={16} />
          {style.warning}
        </p>
      )}

      {style.confidence && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">분석 신뢰도</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {style.confidence.summary}
              </p>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-sm font-bold">
              {style.confidence.label} · {Math.round(style.confidence.score * 100)}
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            관측기간과 거래 기록이 쌓이고 종목의 섹터 분류가 채워질수록 높아집니다.
            신뢰도가 낮은 축은 칭호 선정에서 제외합니다.
          </p>
        </section>
      )}

      {/* 스타일 거울 — 아키타입(우열 없음) */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-sm font-semibold">내 운용 스타일</p>
        <div className="mt-2 flex items-center gap-3">
          <EmojiIcon emoji={style.emoji} size={32} className="text-muted-foreground" />
          <div>
            {style.compositeStyle && (
              <p className="mb-0.5 text-xs font-semibold text-primary">
                조합 칭호
              </p>
            )}
            <p className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
              {style.label}
              {(style.compositeStyle ?? style.primaryStyle) && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {Math.round((style.compositeStyle ?? style.primaryStyle)!.score * 100)}
                </span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">{style.tagline}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground tabular-nums">
          {style.summary}
        </p>
        {style.secondaryStyles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {style.secondaryStyles.map((item) => (
              <span
                key={item.key}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold"
              >
                <EmojiIcon emoji={item.emoji} size={13} />
                {item.label} {Math.round(item.score * 100)}
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          스타일엔 우열이 없어요 — 당신의 투자를 비추는 거울일 뿐이에요.
        </p>
      </section>

      {style.insight && (
        <p className="rounded-xl bg-secondary px-4 py-3 text-sm leading-6">
          {style.insight}
        </p>
      )}

      <StyleChange style={style} previous={previousStyle} />

      {/* 중립 프로파일 */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="mb-3 text-sm font-semibold">프로파일</p>
        <ul className="flex flex-col gap-3">
          {style.dimensions.map((d) => (
            <Bar key={d.key} dim={d} hint={d.evidence ?? DIM_HINT[d.key]} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function StyleChange({
  style,
  previous,
}: {
  style: StyleResult;
  previous: StyleHistorySnapshot | null;
}) {
  if (!previous) {
    return (
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-sm font-semibold">스타일 변화</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          오늘부터 분기별 스타일 변화를 기록합니다. 다음 분기에 운용 성향이
          어떻게 달라졌는지 비교할 수 있어요.
        </p>
      </section>
    );
  }

  const current = new Map(style.dimensions.map((item) => [item.key, item]));
  const changes = previous.dimensions
    .filter((item) => item.available && current.get(item.key)?.available !== false)
    .map((item) => {
      const now = current.get(item.key)!;
      return { label: now.label, delta: now.score - item.score };
    })
    .filter((item) => Math.abs(item.delta) >= 0.05)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);
  const currentTitle = style.compositeStyle ?? style.primaryStyle;
  const changedTitle =
    previous.primaryStyle?.key !== currentTitle?.key &&
    previous.primaryStyle &&
    currentTitle;

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <p className="text-sm font-semibold">스타일 변화</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {previous.asOfDate} 기록과 비교
      </p>
      <p className="mt-3 text-sm font-semibold">
        {changedTitle
          ? `${previous.primaryStyle?.label} → ${currentTitle?.label}`
          : `${currentTitle?.label ?? "현재 성향"}을 유지하고 있어요.`}
      </p>
      {changes.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {changes.map((change) => (
            <li key={change.label} className="flex items-center justify-between text-sm">
              <span>{change.label}</span>
              <span className="font-bold tabular-nums">
                {change.delta > 0 ? "+" : ""}
                {Math.round(change.delta * 100)}점
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          5점 이상 달라진 축이 없습니다.
        </p>
      )}
    </section>
  );
}
