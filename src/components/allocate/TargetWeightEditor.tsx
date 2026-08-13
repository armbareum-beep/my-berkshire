"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { setTargetWeight } from "@/app/allocate/actions";
import { pct } from "@/lib/format";
import { TargetSearchModal } from "./TargetSearchModal";

export interface TargetRow {
  symbol: string;
  label: string;
  /** 현재 목표비중 0~1. 안 정했으면 0. */
  target: number;
  /** 현재 실제 비중 0~1. */
  currentWeight: number;
  held: boolean;
}

/**
 * 목표비중 — **검색형**.
 *
 * 두 번 갈아엎었다. 처음엔 2층(유형 목표 × 유형 내 종목)이라 한 종목에 두 숫자를 맞춰야
 * 했고, 평면으로 바꾼 뒤에도 **"전체 리스트를 훑어 칸을 채우는"** 모양은 그대로였다.
 * 그 모양은 두 가지가 안 된다.
 *
 *   · 종목이 늘면 스크롤이 길어져 "어디를 만져야 하나"가 다시 흐려진다
 *   · 아직 한 주도 없는 기업은 리스트에 없어서 **먼저 후보로 넣고 다시 와야** 한다
 *
 * 그래서 뒤집는다. 위에는 **검색**, 아래에는 **내가 실제로 정해둔 것만** 둔다.
 * 안 정한 종목까지 늘어놓지 않는다 — 0% 칸이 줄줄이 있는 건 목록이 아니라 소음이다.
 */
export function TargetWeightEditor({ rows }: { rows: TargetRow[] }) {
  const [searching, setSearching] = useState(false);

  const set = useMemo(() => rows.filter((r) => r.target > 0), [rows]);
  // 목표비중이 없는 종목 — 배분되지 않는다는 사실만 알린다.
  const unset = useMemo(() => rows.filter((r) => r.target <= 0), [rows]);

  const total = set.reduce((s, r) => s + r.target, 0);
  const remaining = 1 - total;

  const currentTargets = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) if (r.target > 0) m[r.symbol] = r.target;
    return m;
  }, [rows]);

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">목표비중</p>
        <p className="text-xs tabular-nums text-muted-foreground">합계 {pct(total)}</p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {remaining > 0.0001
          ? `남은 ${pct(remaining)}는 현금으로 둡니다.`
          : remaining < -0.0001
            ? "합이 100%를 넘었어요. 넘은 만큼은 비율대로 줄여서 계산합니다."
            : "딱 100%예요."}
      </p>

      {/* ── 검색이 메인 동선 ── */}
      <button
        type="button"
        onClick={() => setSearching(true)}
        className="mt-4 flex w-full items-center gap-2 rounded-xl bg-secondary px-4 py-3 text-left text-sm text-muted-foreground transition active:scale-[0.99]"
      >
        <Search size={16} />
        기업을 찾아 목표비중 정하기
      </button>

      {searching && (
        <TargetSearchModal
          currentTargets={currentTargets}
          onClose={() => setSearching(false)}
        />
      )}

      {/* ── 정해둔 것 ── */}
      {set.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-0.5">
          {set.map((row) => (
            <TargetRowItem key={row.symbol} row={row} />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          아직 정한 목표비중이 없어요. 위에서 기업을 찾아보세요.
        </p>
      )}

      {/* ── 후보인데 비중이 없는 것 — 배분되지 않는다는 사실만 알린다 ── */}
      {unset.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            목표비중이 없어 배분되지 않는 {unset.length}종목:{" "}
            {unset.map((r) => r.label).join(" · ")}
          </p>
        </div>
      )}
    </section>
  );
}

/** 정해둔 한 줄 — 값 수정과 삭제만. 추가는 검색에서 한다. */
function TargetRowItem({ row }: { row: TargetRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [raw, setRaw] = useState(String(+(row.target * 100).toFixed(2)));

  function save() {
    const v = raw.trim();
    const next = v === "" ? 0 : Number(v);
    if (!Number.isFinite(next) || next < 0 || next > 100) {
      toast.error("0~100 사이의 숫자를 넣어주세요.");
      setRaw(String(+(row.target * 100).toFixed(2)));
      return;
    }
    // 값이 그대로면 저장하지 않는다(포커스만 옮겨도 요청이 나가지 않게).
    if (Math.abs(next / 100 - row.target) < 1e-9) return;

    start(async () => {
      const res = await setTargetWeight(row.symbol, next / 100);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (next === 0) toast.success(`${row.label} 목표비중을 지웠어요`);
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-3 rounded-xl px-1 py-2">
      <SymbolAvatar symbol={row.symbol} name={row.label} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{row.label}</p>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          현재 {pct(row.currentWeight)}
          {!row.held && " · 미보유"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          value={raw}
          disabled={pending}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          aria-label={`${row.label} 목표비중 (%)`}
          className="h-9 w-20 text-right tabular-nums"
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
    </li>
  );
}
