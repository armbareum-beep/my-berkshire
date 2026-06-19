"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteManualAsset } from "@/app/networth/actions";
import {
  MANUAL_ASSET_KIND_LABEL,
  manualAssetGain,
  type ManualAsset,
} from "@/lib/finance/realAssets";
import { money, signedMoney, changeColor, type Currency } from "@/lib/format";
import { ManualAssetForm } from "./ManualAssetForm";

type FormTarget = null | "new" | ManualAsset;

/**
 * 실물·대체 자산(부동산 등 수기 평가) 섹션 — "사업부".
 * 순자산에 합산되지만 투자 XIRR 엔 안 들어간다(수기 평가).
 * 등록/수정 폼은 공용 ManualAssetForm 사용.
 */
export function ManualAssetsSection({
  items,
  factor,
  currency,
  today,
  autoOpen = false,
}: {
  items: ManualAsset[];
  factor: number;
  currency: Currency;
  today: string;
  /** 딥링크(/networth?add=asset) 진입 시 등록 폼 자동 열기. */
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<FormTarget>(autoOpen ? "new" : null);
  const cv = (n: number) => n * factor;
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (autoOpen) sectionRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [autoOpen]);

  function remove(id: string) {
    // 인앱 확인(sonner 액션) — 네이티브 다이얼로그 대신 토스 무드 유지.
    toast("이 자산을 삭제할까요? 순자산 계산에서 제외됩니다.", {
      action: {
        label: "삭제",
        onClick: () =>
          startTransition(async () => {
            const res = await deleteManualAsset(id);
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            toast.success("삭제되었습니다");
            router.refresh();
          }),
      },
    });
  }

  return (
    <section ref={sectionRef} className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold">실물·대체 자산</h2>
          <p className="text-xs text-muted-foreground">
            부동산·비상장 등 시세가 없는 자산(사업부)
          </p>
        </div>
        {!target && (
          <button
            type="button"
            onClick={() => setTarget("new")}
            className="rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold text-secondary-foreground"
          >
            + 자산 추가
          </button>
        )}
      </div>

      {items.length === 0 && !target && (
        <p className="mt-3 text-sm text-muted-foreground">
          부동산·토지·비상장 지분 등 시세가 없는 자산을 더하면 순자산이 완성돼요.
          (투자 수익률엔 영향 없이 순자산에만 반영)
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((a) => {
            const gain = manualAssetGain(a);
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-xl bg-secondary p-3"
              >
                <span className="flex flex-col">
                  <span className="font-bold">
                    {a.name}
                    <span className="ml-1.5 rounded-full bg-card px-1.5 py-0.5 align-middle text-[10px] font-semibold text-muted-foreground">
                      {MANUAL_ASSET_KIND_LABEL[a.kind]}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {money(cv(a.currentValue), currency)}
                    {gain !== null && (
                      <span style={{ color: changeColor(gain) }}>
                        {" · "}
                        {signedMoney(cv(gain), currency)}
                      </span>
                    )}
                  </span>
                </span>
                <span className="ml-auto flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setTarget(a)}
                    className="rounded-full bg-card px-3 py-1.5 text-sm font-medium"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(a.id)}
                    className="rounded-full bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground"
                  >
                    삭제
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {target && (
        <div className="mt-4 rounded-xl border border-border p-4">
          <ManualAssetForm
            editing={target === "new" ? null : target}
            today={today}
            onSaved={() => {
              setTarget(null);
              router.refresh();
            }}
            onCancel={() => setTarget(null)}
          />
        </div>
      )}
    </section>
  );
}
