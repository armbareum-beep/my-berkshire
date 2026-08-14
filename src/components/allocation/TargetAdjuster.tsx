"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { setGroupTarget, restoreTargets } from "@/app/allocate/actions";
import { pct } from "@/lib/format";
import type { TagKey } from "@/lib/allocation";

/**
 * 묶음 목표 조정 — "미국 60%".
 *
 * ## 묶음 목표를 저장하지 않는다
 *
 * 이 컨트롤은 **구성 종목의 목표를 비례로 움직인다**(`lib/targetLens.ts:scaleGroupTarget`).
 * "미국 60%" 를 그 자체로 저장하면 같은 것을 두 곳(종목·국가)에서 정하게 되어 스펙 §13.2
 * 가 은퇴시킨 2층 목표비중이 되돌아온다. 진실은 종목 목표 하나뿐이고 국가·산업은 렌즈다.
 *
 * ## 되돌리기가 필수인 이유
 *
 * 한 번 누르면 **종목 여러 개의 목표가 동시에 바뀐다.** 그래서 서버 액션이 직전 저장값을
 * 통째로 돌려주고, 토스트의 되돌리기가 그걸 그대로 되쓴다. 하나씩 되돌리게 두면 사고다.
 */
export function TargetAdjuster({
  tagKey,
  label,
  current,
  target,
  /** 조정할 수 없는 묶음이면 이유. 현금·미분류처럼 구성이 유동적인 것들. */
  lockedReason,
}: {
  tagKey: TagKey;
  label: string;
  current: number;
  target: number;
  lockedReason?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [raw, setRaw] = useState(String(+(target * 100).toFixed(1)));

  const gap = target - current;

  if (lockedReason) {
    return (
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <GapLine current={current} target={target} gap={gap} />
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {lockedReason}
        </p>
      </section>
    );
  }

  function apply() {
    const v = raw.trim();
    const next = v === "" ? 0 : Number(v);
    if (!Number.isFinite(next) || next < 0 || next > 100) {
      toast.error("0~100 사이의 숫자를 넣어주세요.");
      setRaw(String(+(target * 100).toFixed(1)));
      return;
    }
    if (Math.abs(next / 100 - target) < 1e-9) return;

    start(async () => {
      const res = await setGroupTarget(tagKey, label, next / 100);
      if (!res.ok) {
        toast.error(res.error);
        setRaw(String(+(target * 100).toFixed(1)));
        return;
      }
      const { previous, total } = res;
      toast.success(`${label} 목표를 ${pct(next / 100)}로 맞췄어요`, {
        description:
          total > 1.0001
            ? `목표 합이 ${pct(total)}가 됐어요 — 넘은 만큼은 비율대로 줄여서 계산합니다.`
            : undefined,
        action: {
          label: "되돌리기",
          onClick: () => {
            start(async () => {
              const back = await restoreTargets(previous);
              if (!back.ok) {
                toast.error(back.error);
                return;
              }
              toast.success("되돌렸어요");
              router.refresh();
            });
          },
        },
      });
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl bg-card p-4 shadow-card">
      <GapLine current={current} target={target} gap={gap} />
      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1">
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            value={raw}
            disabled={pending}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply();
            }}
            aria-label={`${label} 목표비중 (%)`}
            className="h-10 w-24 text-right tabular-nums"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
        <button
          type="button"
          onClick={apply}
          disabled={pending}
          className="h-10 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "맞추는 중…" : "목표 맞추기"}
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        이 묶음 종목들의 목표를 <b>비율 그대로</b> 늘리거나 줄여 합을 맞춰요. 종목 사이의
        상대 비중은 그대로 남습니다.
      </p>
    </section>
  );
}

/** 현재 → 목표와 갭 한 줄. 갭은 "더 채워야 하나"를 색 없이 부호로만 말한다. */
function GapLine({
  current,
  target,
  gap,
}: {
  current: number;
  target: number;
  gap: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-sm font-semibold">
        <span className="tabular-nums">{pct(current)}</span>
        <span className="mx-1 text-muted-foreground">→ 목표</span>
        <span className="tabular-nums">{pct(target)}</span>
      </p>
      <p className="text-xs tabular-nums text-muted-foreground">
        {Math.abs(gap) < 0.0001
          ? "목표에 맞음"
          : gap > 0
            ? `${pct(gap)} 부족`
            : `${pct(-gap)} 초과`}
      </p>
    </div>
  );
}
