"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setHouseHurdle } from "@/app/allocate/actions";
import { HURDLE_LEVELS, levelOf } from "@/lib/hurdle";
import { pct } from "@/lib/format";

/**
 * 난이도(요구수익률) 카드 — PRD v0.3 §3.2, 게이미피케이션 §2.
 *
 * 요구수익률을 "난이도"로 프레이밍한다. 올리면 통과하는 종목이 줄고 현금이 늘어난다 —
 * 스스로 게임을 어렵게 만드는 노브다.
 *
 * ⚠️ 축하 매트릭스(`celebration.ts`): 여기서 축하하는 것은 **허들을 정하는 결정**뿐이다.
 * "허들을 넘긴 종목이 생겼다"는 주가가 내려온 결과일 수 있어 시장발이므로 축하하지 않는다.
 */
export function HurdleCard({
  rate,
  /** 이 허들을 통과한 종목 수 / 가정이 있는 종목 수. 가정이 없으면 0/0. */
  passing,
  total,
}: {
  rate: number;
  passing: number;
  total: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState("");
  const [open, setOpen] = useState(false);

  const current = levelOf(rate);

  function save(next: number | null) {
    start(async () => {
      const res = await setHouseHurdle(next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        next == null ? "기본 허들로 되돌렸어요" : `내 허들: 연 ${pct(next)}`,
      );
      setOpen(false);
      setCustom("");
      router.refresh();
    });
  }

  function saveCustom() {
    const v = Number(custom.trim());
    if (!Number.isFinite(v) || v <= 0 || v > 100) {
      toast.error("0~100 사이의 숫자를 넣어주세요.");
      return;
    }
    save(v / 100);
  }

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">내 허들</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            이걸 못 넘기면 사지 않습니다
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-extrabold tabular-nums">{pct(rate)}</p>
          {current && (
            <p className="text-[11px] font-semibold text-muted-foreground">
              {current.label}
            </p>
          )}
        </div>
      </div>

      {/* 통과 현황 — 숫자는 정직하게. 통과가 0이어도 그대로 보여준다. */}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {total > 0
          ? `가정을 넣은 ${total}종목 중 ${passing}종목이 이 허들을 넘습니다.`
          : "아직 가정을 넣은 종목이 없어 통과 여부를 판정할 수 없어요."}
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 text-[11px] font-medium text-primary underline"
        >
          난이도 바꾸기
        </button>
      ) : (
        <div className="mt-3 rounded-lg border border-border p-3">
          <div className="flex flex-col gap-1.5">
            {HURDLE_LEVELS.map((level) => {
              const active = Math.abs(level.rate - rate) < 1e-9;
              return (
                <button
                  key={level.key}
                  type="button"
                  disabled={pending}
                  onClick={() => save(level.rate)}
                  className={
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition active:scale-[0.99] " +
                    (active ? "bg-accent" : "bg-secondary/60")
                  }
                >
                  <span
                    className={
                      "shrink-0 text-sm font-bold tabular-nums " +
                      (active ? "text-primary" : "")
                    }
                  >
                    {pct(level.rate)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">{level.label}</span>
                    <span className="block text-[11px] leading-relaxed text-muted-foreground">
                      {level.note}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[11px] font-medium">직접 입력 (%)</label>
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder={String(rate * 100)}
                className="mt-1 h-9"
              />
            </div>
            <Button
              onClick={saveCustom}
              disabled={pending || custom.trim() === ""}
              className="h-9 bg-primary px-4 text-xs font-semibold text-primary-foreground"
            >
              적용
            </Button>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              onClick={() => save(null)}
              disabled={pending}
              className="h-9 flex-1 text-xs"
            >
              기본값(12%)으로
            </Button>
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="h-9 px-3 text-xs"
            >
              닫기
            </Button>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            종목별로 따로 정한 요구수익률이 있으면 그 종목은 그 값을 씁니다 — 여기 값은
            정하지 않은 종목에만 적용돼요.
          </p>
        </div>
      )}
    </section>
  );
}
