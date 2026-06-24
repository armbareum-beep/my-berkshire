"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteLiability } from "@/app/networth/actions";
import {
  LIABILITY_KIND_LABEL,
  type Liability,
} from "@/lib/finance/liabilities";
import { money, pct, type Currency } from "@/lib/format";
import { LiabilityForm } from "./LiabilityForm";

/** 폼 상태: null=닫힘, "new"=신규, Liability=수정. */
type FormTarget = null | "new" | Liability;

/**
 * 부채 목록 + 추가/수정/삭제 — 재무상태표의 부채 쪽.
 * 등록/수정 폼은 공용 LiabilityForm(거래 플로우와 동일) 사용.
 * 금액은 ₩로 저장(입력도 ₩). 표시는 factor 로 환산.
 */
export function LiabilitiesSection({
  items,
  realEstateAssets = [],
  factor,
  currency,
  today,
  autoOpen = false,
}: {
  items: Liability[];
  /** 담보대출 연결 후보 부동산(id·이름). 폼 셀렉터·연결명 표시용(spec 012). */
  realEstateAssets?: { id: string; name: string }[];
  factor: number;
  currency: Currency;
  today: string;
  /** 딥링크(/networth?add=debt) 진입 시 등록 폼을 처음부터 펼친다. */
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<FormTarget>(autoOpen ? "new" : null);
  const cv = (n: number) => n * factor;
  const sectionRef = useRef<HTMLElement>(null);
  const assetNameById = new Map(realEstateAssets.map((a) => [a.id, a.name]));

  // 딥링크로 들어오면 등록 폼(하단)까지 스크롤.
  useEffect(() => {
    if (autoOpen) sectionRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [autoOpen]);

  function remove(id: string) {
    // 인앱 확인(sonner 액션) — 네이티브 다이얼로그 대신 토스 무드 유지.
    toast("이 부채를 삭제할까요? 순자산 계산에서 제외됩니다.", {
      action: {
        label: "삭제",
        onClick: () =>
          startTransition(async () => {
            const res = await deleteLiability(id);
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
        <h2 className="font-bold">부채</h2>
        {!target && (
          <button
            type="button"
            onClick={() => setTarget("new")}
            className="rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold text-secondary-foreground"
          >
            + 부채 추가
          </button>
        )}
      </div>

      {/* 목록 */}
      {items.length === 0 && !target && (
        <p className="mt-3 text-sm text-muted-foreground">
          등록된 부채가 없어요. 무차입이 가장 좋지만, 대출·마진이 있다면 적어두면
          순자산과 레버리지 리스크를 정확히 볼 수 있어요.
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-3 rounded-xl bg-secondary p-3"
            >
              <span className="flex flex-col">
                <span className="font-bold">
                  {l.name}
                  <span className="ml-1.5 rounded-full bg-card px-1.5 py-0.5 align-middle text-[10px] font-semibold text-muted-foreground">
                    {LIABILITY_KIND_LABEL[l.kind]}
                  </span>
                </span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {money(cv(l.principal), currency)}
                  {l.interestRate > 0 && ` · 연 ${pct(l.interestRate)}`}
                  {l.startedAt && ` · ${l.startedAt}`}
                  {l.manualAssetId && assetNameById.has(l.manualAssetId) &&
                    ` · 🏠 ${assetNameById.get(l.manualAssetId)}`}
                </span>
              </span>
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setTarget(l)}
                  className="rounded-full bg-card px-3 py-1.5 text-sm font-medium"
                >
                  수정
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(l.id)}
                  className="rounded-full bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground"
                >
                  삭제
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* 추가/수정 폼(공용) */}
      {target && (
        <div className="mt-4 rounded-xl border border-border p-4">
          <LiabilityForm
            editing={target === "new" ? null : target}
            today={today}
            assets={realEstateAssets}
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
