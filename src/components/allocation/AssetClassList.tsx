"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  applyAllSuggestions,
  setAssetClass,
} from "@/app/allocation/types/actions";
import { ASSET_CLASSES, type AssetClass } from "@/lib/assetClass";
import { money, type Currency } from "@/lib/format";

export interface ClassRow {
  symbol: string;
  name: string;
  /** 지금 이 앱이 쓰고 있는 유형(덮어쓰기까지 반영된 값). */
  assetType: string;
  /** 평가액(표시통화). 안 산 목표 종목은 0. */
  value: number;
  /** 사용자가 직접 정했는가 — 아니면 카탈로그 자동값이다. */
  pinned: boolean;
  /** 이름 규칙이 다르게 보는 경우. 없으면 제안 없음. */
  suggestion?: AssetClass;
}

/**
 * 자산유형 정리 — **상품이 아니라 역할로** 다시 붙이는 화면.
 *
 * ## 왜 이 화면이 생겼나
 *
 * 사용자가 채권·원자재를 배분에 못 넣고 있었다: *"내가 이걸 못한 이유는 분류를 못하기
 * 때문이야."* 실제로 `securities.asset_type` 은 야후 instrumentType 이라 국채 ETF 도
 * 금현물 ETF 도 전부 `ETF` 로 들어온다. 그러니 엑셀에서 쓰던 **ETF 20% / 주식 75% /
 * 채권 5%** 정책을 앱에서는 **적을 수조차 없었다.**
 *
 * ## 왜 드래그앤드롭이 아닌가
 *
 * 사용자가 먼저 낸 안은 드래그앤드롭이었다. 그런데 여기서 진짜 비용은 **옮기는 동작**이
 * 아니라 **하나하나 옮겨야 한다는 것**이다 — 종목 수만큼 반복된다. 이름만 봐도 아는 걸
 * 사람이 옮기게 하는 대신, 규칙이 먼저 제안하고 사용자는 **한 번 훑고 한 번 누른다.**
 * 규칙이 틀린 줄만 칩으로 고치면 된다(모바일에서 손가락 드래그는 정확도도 나쁘다).
 *
 * ## 자동으로 적용하지 않는다
 *
 * 규칙은 완벽할 수 없다 — `KODEX 200미국채혼합` 은 이름에 "미국채"가 있지만 주식+채권
 * 혼합이다. 조용히 옮기면 사용자가 시킨 적 없는 분류가 생기고, 그건 이 앱이 `capToOne`
 * 때부터 계속 거절해 온 종류의 일이다. 그래서 **제안까지만** 하고 적용은 사람이 누른다.
 */
export function AssetClassList({
  rows,
  currency,
}: {
  rows: ClassRow[];
  currency: Currency;
}) {
  const [picking, setPicking] = useState<ClassRow | null>(null);
  const suggested = rows.filter((r) => r.suggestion);

  // 화면 순서는 유형별로 묶는다 — "지금 뭐가 어디 들어가 있나"가 이 화면의 질문이라
  // 같은 유형끼리 붙어 있어야 한눈에 틀린 게 보인다.
  const groups = groupByType(rows);

  return (
    <div className="flex flex-col gap-3">
      {suggested.length > 0 && <SuggestBanner rows={suggested} />}

      {groups.map(([type, list]) => (
        <section key={type} className="flex flex-col gap-2">
          <p className="px-1 text-xs font-semibold text-muted-foreground">
            {type} · {list.length}종목
          </p>
          <ul className="flex flex-col gap-2">
            {list.map((r) => (
              <li key={r.symbol}>
                <button
                  type="button"
                  onClick={() => setPicking(r)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-card transition active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {r.name}
                    </span>
                    <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                      {r.symbol}
                      {r.value > 0 && ` · ${money(r.value, currency)}`}
                      {r.value === 0 && " · 아직 안 샀어요"}
                    </span>
                    {r.suggestion && (
                      <span className="mt-1 block text-[11px] leading-snug text-primary">
                        이름으로 보면 {r.suggestion} 같아요
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
                    {r.assetType}
                    {r.pinned && <span className="ml-1 opacity-50">직접</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <ClassPicker row={picking} onClose={() => setPicking(null)} />
    </div>
  );
}

/** 유형별로 묶되 순서는 종목 수가 아니라 **금액**이 큰 묶음부터. */
function groupByType(rows: ClassRow[]): [string, ClassRow[]][] {
  const by = new Map<string, ClassRow[]>();
  for (const r of rows) {
    const list = by.get(r.assetType) ?? [];
    list.push(r);
    by.set(r.assetType, list);
  }
  for (const list of by.values()) list.sort((a, b) => b.value - a.value);
  return [...by.entries()].sort(
    (a, b) => sumValue(b[1]) - sumValue(a[1]),
  );
}

const sumValue = (rows: ClassRow[]) => rows.reduce((s, r) => s + r.value, 0);

/**
 * 제안 배너 — 이 화면의 **주 동선**이다.
 *
 * 종목이 열 개든 쉰 개든 여기서 한 번 누르면 끝난다. 목록을 먼저 보여 주는 이유는
 * 누르기 전에 무엇이 바뀔지 알 수 있어야 하기 때문이다.
 */
function SuggestBanner({ rows }: { rows: ClassRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4">
      <div>
        <p className="text-sm font-semibold">
          옮길 게 {rows.length}개 있어요
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {rows.map((r) => (
            <li
              key={r.symbol}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="shrink-0 tabular-nums">
                {r.assetType} → <b className="text-foreground">{r.suggestion}</b>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await applyAllSuggestions();
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            toast.success(`${res.applied ?? 0}개를 옮겼어요`);
            router.refresh();
          })
        }
        className="h-11 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition active:scale-[0.98] disabled:opacity-50"
      >
        전부 적용
      </button>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        이름 규칙으로 고른 것이라 틀릴 수 있어요. 적용한 뒤에도 줄을 눌러 바꿀 수 있습니다.
      </p>
    </section>
  );
}

/** 한 종목의 유형을 칩으로 고른다. `자동`은 덮어쓰기를 지워 카탈로그 값으로 되돌린다. */
function ClassPicker({
  row,
  onClose,
}: {
  row: ClassRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function pick(next: AssetClass | null) {
    if (!row) return;
    start(async () => {
      const res = await setAssetClass([row.symbol], next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(next ? `${row.name} → ${next}` : `${row.name} 자동으로`);
      onClose();
      router.refresh();
    });
  }

  return (
    <BottomSheet open={row != null} onClose={onClose} title={row?.name}>
      <div className="flex flex-col gap-3 pb-2">
        <p className="text-xs leading-relaxed text-muted-foreground">
          배분에서 이 종목을 <b>무엇으로 셀지</b> 고릅니다. 상품 종류가 아니라 역할이라,
          국채 ETF 는 채권·금현물 ETF 는 원자재로 두면 됩니다.
        </p>
        <div className="flex flex-wrap gap-2">
          {ASSET_CLASSES.map((c) => (
            <button
              key={c}
              type="button"
              disabled={pending}
              onClick={() => pick(c)}
              className={`flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.97] disabled:opacity-50 ${
                row?.assetType === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary"
              }`}
            >
              {row?.assetType === c && <Check className="h-4 w-4" />}
              {c}
            </button>
          ))}
        </div>
        {row?.pinned && (
          <button
            type="button"
            disabled={pending}
            onClick={() => pick(null)}
            className="h-10 rounded-xl border border-border text-sm font-medium transition active:scale-[0.98] disabled:opacity-50"
          >
            자동으로 되돌리기
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
