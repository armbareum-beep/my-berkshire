"use client";

import { useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { money, pct, type Currency } from "@/lib/format";
import type { RankBasis } from "@/lib/allocateRanking";
import type { AllocateRow } from "@/lib/allocateData";

/**
 * 순위 근거 칩 — **왜 이 자리인지**를 한 값으로 보여주고, 누르면 **그 값이 어디서 왔는지**.
 *
 * ## 왜 ⓘ 가 필요한가
 *
 * 정렬 키를 줄에 띄우자 순서에 로직이 있다는 건 보이게 됐다. 그런데 `기대 17.2%` 자체가
 * 어디서 나온 숫자인지는 여전히 블랙박스였다. 사용자 요청: *"그 기대수익률을 계산한 공식도
 * 볼 수 있게 해줘. ⓘ 버튼 누르면 알려주게 하던지."*
 *
 * 이 모형은 **사실이 아니라 사용자 가정**이다(`lib/finance/expectedReturn.ts` 머리말 —
 * "적정가 X" 금지, "내 가정으로는 X"). 그러니 숫자만 던지는 건 이 앱의 원칙에 어긋난다.
 * 식을 **넣은 값 그대로 펼쳐** 보여주고, 고치러 갈 길도 같이 낸다.
 *
 * ## 근거의 종류마다 할 말이 다르다
 *
 * | 근거 | 칩 | ⓘ 가 말하는 것 |
 * |---|---|---|
 * | `cagr` | `기대 17.2%` | 식과 넣은 가정, 요구수익률 기준 매수가 |
 * | `unjudged` | `가정 없음` | 왜 아래로 내려갔는지, 지금 뭐로 판단 중인지 |
 * | `gap` | `미달 12.0%` | ETF 는 식 자체를 쓸 수 없다는 것 |
 *
 * `unjudged` 를 "0%"로 적지 않는 이유는 정렬 규칙과 같다 — **모르는 것을 0으로 취급하지
 * 않는다.** ETF 도 가정을 *안 넣은* 게 아니라 *넣을 수 없는* 것이라 문구를 따로 쓴다.
 */
export function RankBasisChip({
  basis,
  row,
  label,
  symbol,
  requiredReturn,
}: {
  basis: RankBasis;
  /** 식을 펼치는 데 쓰는 가정·중간값. 없으면 칩만 보여준다. */
  row?: AllocateRow;
  label: string;
  symbol: string;
  /** 이 종목에 적용된 요구수익률(종목별 > 전사 > 기본). */
  requiredReturn?: number | null;
}) {
  const [open, setOpen] = useState(false);

  const text =
    basis.kind === "cagr"
      ? `기대 ${pct(basis.cagr)}`
      : basis.kind === "unjudged"
        ? "가정 없음"
        : basis.gap > 0.0001
          ? `미달 ${pct(basis.gap)}`
          : "목표 도달";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label} 순위 근거 — ${text}`}
        className={
          "flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold tabular-nums transition active:scale-95 " +
          (basis.kind === "unjudged"
            ? "bg-secondary text-muted-foreground"
            : "bg-primary/10 text-primary")
        }
      >
        {text}
        <Info size={11} aria-hidden />
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={label}>
        {basis.kind === "cagr" ? (
          <CagrExplain
            row={row}
            cagr={basis.cagr}
            requiredReturn={requiredReturn}
          />
        ) : basis.kind === "unjudged" ? (
          <UnjudgedExplain gap={basis.gap} />
        ) : (
          <GapExplain gap={basis.gap} />
        )}

        <Link
          href={`/stocks/${symbol}`}
          className="mt-5 flex h-12 items-center justify-center rounded-xl bg-secondary text-sm font-semibold transition active:scale-[0.99]"
        >
          {basis.kind === "gap" ? "종목 보기" : "가정 고치러 가기"} ›
        </Link>
      </BottomSheet>
    </>
  );
}

/** 식을 넣은 값 그대로 펼친다 — 여기서 다시 계산하지 않고 서버가 준 중간값을 쓴다. */
function CagrExplain({
  row,
  cagr,
  requiredReturn,
}: {
  row?: AllocateRow;
  cagr: number;
  requiredReturn?: number | null;
}) {
  const er = row?.erInputs;
  const ccy: Currency = row?.nativeCcy ?? "KRW";
  const price = row?.nativePrice ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs text-muted-foreground">내 가정으로는</p>
        <p className="text-3xl font-extrabold tabular-nums text-primary">
          연 {pct(cagr)}
        </p>
      </div>

      {er ? (
        <>
          <dl className="flex flex-col gap-1.5 rounded-xl bg-secondary p-4 text-sm">
            <Row k="현재 이익력(주당)" v={money(er.metric, ccy)} />
            <Row k={`향후 ${er.years}년 성장률`} v={`연 ${pct(er.growth)}`} />
            <Row k={`${er.years}년 뒤 배수`} v={`${+er.terminalMultiple.toFixed(1)}배`} />
          </dl>

          {/* 식을 글로만 적으면 "그래서 어디에 뭘 넣은 건데"가 남는다 — 넣은 값 그대로. */}
          <div className="rounded-xl border border-border p-4 text-xs leading-relaxed">
            <p className="font-semibold">{er.years}년 뒤 예상 주가</p>
            <p className="mt-1 tabular-nums text-muted-foreground">
              {money(er.metric, ccy)} × (1 + {pct(er.growth)})
              <sup>{er.years}</sup> × {+er.terminalMultiple.toFixed(1)}배
            </p>
            <p className="mt-1 font-bold tabular-nums">
              = {money(er.futurePrice, ccy)}
            </p>

            <p className="mt-3 font-semibold">기대수익률</p>
            <p className="mt-1 tabular-nums text-muted-foreground">
              ({money(er.futurePrice, ccy)} ÷{" "}
              {price != null ? money(price, ccy) : "현재가"})
              <sup>1/{er.years}</sup> − 1
            </p>
            <p className="mt-1 font-bold tabular-nums">= 연 {pct(cagr)}</p>
          </div>

          {row?.buyPrice != null && requiredReturn != null && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              요구수익률 <b>연 {pct(requiredReturn)}</b>를 채우려면{" "}
              <b>{money(row.buyPrice, ccy)}</b> 이하로 사야 해요
              {price != null && (
                <> — 지금은 {money(price, ccy)}예요.</>
              )}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          가정을 불러오지 못했어요. 종목 화면에서 확인해 주세요.
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        ⚠️ 이건 <b>사실이 아니라 가정</b>이에요. 성장률·배수·요구수익률은 직접
        넣은 값이라, 바꾸면 이 숫자와 순위도 바뀝니다.
      </p>
    </div>
  );
}

function UnjudgedExplain({ gap }: { gap: number }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed">
      <p className="font-semibold">아직 기대수익률을 계산할 수 없어요</p>
      <p className="text-muted-foreground">
        이익력·성장률·종료배수 중 빠진 게 있어요. 셋이 다 있어야 식이 성립합니다.
      </p>
      <div className="rounded-xl bg-secondary p-4 text-xs leading-relaxed">
        <p className="font-semibold">그래서 지금은</p>
        <p className="mt-1 text-muted-foreground">
          기대수익률이 있는 종목들 <b>아래</b>에 두고, 그 안에서는{" "}
          <b>목표까지 모자란 순</b>으로 세워요
          {gap > 0.0001 && <> — 이 종목은 {pct(gap)} 모자라요</>}.
        </p>
        <p className="mt-2 text-muted-foreground">
          모르는 걸 <b>0%로 치지 않으려고</b> 이렇게 합니다. 0%로 치면 &#34;나쁜
          종목&#34;이 되어 맨 아래로 밀리거든요.
        </p>
      </div>
    </div>
  );
}

function GapExplain({ gap }: { gap: number }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed">
      <p className="font-semibold">여기는 목표 미달로 줄 세워요</p>
      <p className="text-muted-foreground">
        기대수익률 식은 <b>주당 이익 × 성장 × 배수</b>라 개별 기업에만 성립해요.
        ETF·코인·원자재는 주당 이익이 없거나 뜻이 달라서 <b>쓸 수 없습니다</b> —
        가정을 안 넣은 게 아니라 넣을 수 없는 거예요.
      </p>
      <div className="rounded-xl bg-secondary p-4 text-xs leading-relaxed">
        <p className="text-muted-foreground">
          대신 <b>목표비중까지 얼마나 모자란지</b>로만 판단해요
          {gap > 0.0001 ? (
            <> — 이 종목은 {pct(gap)} 모자라요.</>
          ) : (
            <> — 이 종목은 목표를 채웠어요.</>
          )}
        </p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-semibold tabular-nums">{v}</dd>
    </div>
  );
}
