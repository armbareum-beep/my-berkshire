"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deleteManualAsset,
  addManualAssetIncome,
  sellManualAsset,
  deleteLiability,
} from "@/app/networth/actions";
import { deleteFinancingReconciliation } from "@/app/real-estate/actions";
import type { Liability } from "@/lib/finance/liabilities";
import {
  MANUAL_ASSET_KIND_LABEL,
  isSold,
  unrealizedGain,
  saleGain,
  rentNet,
  computeDivisions,
  assetDivision,
  type ManualAsset,
  type ManualAssetIncome,
  type LinkedLoan,
} from "@/lib/finance/realAssets";
import type {
  DivisionFinancingCost,
  FinancingReconciliation,
} from "@/lib/finance/financing";
import {
  money,
  signedMoney,
  signedPct,
  changeColor,
  type Currency,
} from "@/lib/format";
import { ManualAssetForm } from "./ManualAssetForm";
import { FinancingReconcileForm } from "./FinancingReconcileForm";
import { LiabilityForm } from "./LiabilityForm";

type FormTarget = null | "new" | ManualAsset;
type SubForm =
  | { kind: "rent" | "sell"; asset: ManualAsset }
  /** loan: liability 있으면 수정, 없으면 신규(그 물건에 연결). */
  | { kind: "loan"; asset: ManualAsset; liability?: Liability }
  | null;

/**
 * 사업부 자산 관리 — 종류를 사업부로 묶어(부동산/실물/사업) 자산별 손익·임대·매도.
 * 수익 내는 사업부만 임대 입력 노출. 순자산 XIRR 과 분리(자체 원장).
 */
export function ManualAssetsSection({
  items,
  incomes,
  financing,
  reconciliations = [],
  loansByAsset = {},
  factor,
  currency,
  today,
  autoOpen = false,
}: {
  items: ManualAsset[];
  incomes: ManualAssetIncome[];
  /** 부동산 사업부 금융비용(담보대출 추정 이자 + 보정). 없으면 이자 0(기존과 동일). */
  financing?: DivisionFinancingCost;
  reconciliations?: FinancingReconciliation[];
  /** 물건 id → 연결된 대출 목록(이름·월 이자). 물건 행에 연결 표시(spec 012). */
  loansByAsset?: Record<string, LinkedLoan[]>;
  factor: number;
  currency: Currency;
  today: string;
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<FormTarget>(autoOpen ? "new" : null);
  const [subForm, setSubForm] = useState<SubForm>(null);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const cv = (n: number) => n * factor;
  const sectionRef = useRef<HTMLElement>(null);
  const divisions = computeDivisions(items, incomes, financing);
  // 담보대출 연결 후보(부동산 사업부 자산) — 물건 행 "대출" 폼 셀렉터용.
  const reAssetOptions = items
    .filter((a) => assetDivision(a.kind) === "REAL_ESTATE")
    .map((a) => ({ id: a.id, name: a.name }));
  // 물건에 연결된 대출 월 이자 합 — 연결분은 물건 카드에 표시, 푸터엔 미연결(공통)분만.
  const linkedMonthlyTotal = Object.values(loansByAsset)
    .flat()
    .reduce((s, l) => s + l.monthly, 0);
  const commonMonthly = (financing?.monthlyEstimate ?? 0) - linkedMonthlyTotal;

  function removeReconcile(id: string) {
    startTransition(async () => {
      const res = await deleteFinancingReconciliation(id);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("보정을 삭제했어요");
      router.refresh();
    });
  }

  function removeLoan(loan: Liability) {
    toast(`'${loan.name}' 대출을 삭제할까요?`, {
      action: {
        label: "삭제",
        onClick: () =>
          startTransition(async () => {
            const res = await deleteLiability(loan.id);
            if (!res.ok) { toast.error(res.error); return; }
            toast.success("대출을 삭제했어요");
            router.refresh();
          }),
      },
    });
  }

  useEffect(() => {
    if (autoOpen) sectionRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [autoOpen]);

  function remove(id: string) {
    toast("이 자산을 삭제할까요? 순자산 계산에서 제외됩니다.", {
      action: {
        label: "삭제",
        onClick: () =>
          startTransition(async () => {
            const res = await deleteManualAsset(id);
            if (!res.ok) { toast.error(res.error); return; }
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
          <h2 className="font-bold">사업부 자산</h2>
          <p className="text-xs text-muted-foreground">
            부동산·미술품·비상장 등 — 종류별 사업부로 묶임 · 평가는 추정
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
          부동산·비상장 지분·미술품 등 시세가 없는 자산을 더하면 순자산이 완성돼요.
          (투자 수익률엔 영향 없이 순자산에만 반영)
        </p>
      )}

      {/* 사업부별 묶음 */}
      {divisions.map((d) => (
        <div key={d.key} className="mt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">{d.label}</span>
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: changeColor(d.totals.ret ?? 0) }}
            >
              {d.totals.ret != null ? signedPct(d.totals.ret) : "—"}
            </span>
          </div>

          <ul className="mt-2 flex flex-col gap-2">
            {d.assets.map((a) => {
              const sold = isSold(a);
              const unreal = unrealizedGain(a);
              const realized = saleGain(a) + rentNet(a.id, incomes);
              return (
                <li key={a.id} className="rounded-xl bg-secondary p-3">
                  <div className="flex items-start gap-3">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-bold">
                        {a.name}
                        <span className="ml-1.5 rounded-full bg-card px-1.5 py-0.5 align-middle text-[10px] font-semibold text-muted-foreground">
                          {sold ? "매도됨" : MANUAL_ASSET_KIND_LABEL[a.kind]}
                        </span>
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {sold && a.salePrice != null
                          ? `매도 ${money(cv(a.salePrice), currency)}`
                          : money(cv(a.currentValue), currency)}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs tabular-nums text-muted-foreground">
                        {!sold && (
                          <span style={{ color: changeColor(unreal) }}>
                            미실현 {signedMoney(cv(unreal), currency)}
                          </span>
                        )}
                        {realized !== 0 && (
                          <span style={{ color: changeColor(realized) }}>
                            실현 {signedMoney(cv(realized), currency)}
                          </span>
                        )}
                      </span>
                      {(a.valuationSource || a.valuedAt) && (
                        <span className="text-[11px] text-muted-foreground">
                          추정
                          {a.valuationSource ? ` · ${a.valuationSource}` : ""}
                          {a.valuedAt ? ` · ${a.valuedAt}` : ""}
                        </span>
                      )}
                      {(loansByAsset[a.id]?.length ?? 0) > 0 && (
                        <span className="mt-0.5 flex flex-col gap-0.5 text-[11px] text-amber-700">
                          {loansByAsset[a.id].map(({ liability: loan, monthly, cumulative }) => (
                            <span key={loan.id} className="flex flex-wrap items-center gap-x-1.5">
                              <span>
                                🔗 {loan.name} · 이자(추정) 월 약{" "}
                                {money(cv(monthly), currency)} · 누적{" "}
                                {money(cv(cumulative), currency)}
                              </span>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  setSubForm({ kind: "loan", asset: a, liability: loan })
                                }
                                className="underline"
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => removeLoan(loan)}
                                className="underline"
                              >
                                삭제
                              </button>
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="ml-auto flex shrink-0 flex-wrap justify-end gap-1.5">
                      {!sold && d.producesIncome && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setSubForm({ kind: "rent", asset: a })}
                          className="rounded-full bg-card px-2.5 py-1 text-xs font-medium"
                        >
                          {d.key === "BUSINESS" ? "배당·수익" : "임대"}
                        </button>
                      )}
                      {!sold && d.key === "REAL_ESTATE" && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setSubForm({ kind: "loan", asset: a })}
                          className="rounded-full bg-card px-2.5 py-1 text-xs font-medium"
                        >
                          대출
                        </button>
                      )}
                      {!sold && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setSubForm({ kind: "sell", asset: a })}
                          className="rounded-full bg-card px-2.5 py-1 text-xs font-medium"
                        >
                          매도
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setTarget(a)}
                        className="rounded-full bg-card px-2.5 py-1 text-xs font-medium"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => remove(a.id)}
                        className="rounded-full bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground"
                      >
                        삭제
                      </button>
                    </span>
                  </div>

                  {subForm?.asset.id === a.id && (
                    <div className="mt-3 border-t border-border pt-3">
                      {subForm.kind === "rent" ? (
                        <RentForm
                          asset={a}
                          today={today}
                          incomeLabel={d.key === "BUSINESS" ? "배당·수익" : "임대수익"}
                          onDone={() => {
                            setSubForm(null);
                            router.refresh();
                          }}
                          onCancel={() => setSubForm(null)}
                        />
                      ) : subForm.kind === "loan" ? (
                        <>
                          <p className="mb-2 text-sm font-semibold">
                            {subForm.liability ? "대출 수정" : "대출 연결"} · {a.name}
                          </p>
                          <LiabilityForm
                            editing={subForm.liability ?? null}
                            today={today}
                            assets={reAssetOptions}
                            defaultKind="MORTGAGE"
                            defaultAssetId={a.id}
                            onSaved={() => {
                              setSubForm(null);
                              router.refresh();
                            }}
                            onCancel={() => setSubForm(null)}
                          />
                        </>
                      ) : (
                        <SellForm
                          asset={a}
                          today={today}
                          onDone={() => {
                            setSubForm(null);
                            router.refresh();
                          }}
                          onCancel={() => setSubForm(null)}
                        />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* 부동산 사업부 푸터 — 미연결(공통) 대출 안내 + 실제값 보정(division-level) */}
          {d.key === "REAL_ESTATE" &&
            (commonMonthly >= 1 ||
              reconciliations.length > 0 ||
              linkedMonthlyTotal >= 1) && (
              <div className="mt-2 px-1 text-[11px] text-muted-foreground">
                {commonMonthly >= 1 && (
                  <p className="tabular-nums">
                    미연결 공통 대출이자(추정) 월 약{" "}
                    {money(cv(commonMonthly), currency)}
                  </p>
                )}
                {reconciliations.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {reconciliations.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 tabular-nums"
                      >
                        <span>
                          보정 {r.date} ·{" "}
                          {r.kind === "capital" ? "자본 투입" : "이자 확정"}
                        </span>
                        <span className="flex items-center gap-2">
                          <span>{money(cv(r.amount), currency)}</span>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => removeReconcile(r.id)}
                            className="underline"
                          >
                            삭제
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {reconcileOpen ? (
                  <div className="mt-2 rounded-xl bg-secondary p-3">
                    <FinancingReconcileForm
                      today={today}
                      onDone={() => {
                        setReconcileOpen(false);
                        router.refresh();
                      }}
                      onCancel={() => setReconcileOpen(false)}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReconcileOpen(true)}
                    className="mt-1 text-muted-foreground underline"
                  >
                    이자 실제값 보정
                  </button>
                )}
              </div>
            )}
        </div>
      ))}

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

/** 현금수익 기록(임대·배당) — 자산별 자체 원장(events 미연동). */
function RentForm({
  asset,
  today,
  incomeLabel,
  onDone,
  onCancel,
}: {
  asset: ManualAsset;
  today: string;
  incomeLabel: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const amt = Number(amount);
    if (!(amt > 0)) return toast.error(`${incomeLabel}을 입력하세요.`);
    startTransition(async () => {
      const res = await addManualAssetIncome({
        manualAssetId: asset.id,
        date,
        amount: amt,
        cost: cost.trim() === "" ? 0 : Number(cost),
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`${incomeLabel}을 기록했어요`);
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">
        {incomeLabel} 기록 · {asset.name}
      </p>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
      />
      <input
        inputMode="numeric"
        placeholder={`${incomeLabel} (원)`}
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums"
      />
      <input
        inputMode="numeric"
        placeholder="세금·비용 (원) — 모르면 비움"
        value={cost}
        onChange={(e) => setCost(e.target.value.replace(/[^0-9]/g, ""))}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground"
        >
          기록
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium"
        >
          취소
        </button>
      </div>
    </div>
  );
}

/** 매도 기록 — 매도차익 실현, 보유에서 제외. 대금은 events 미연동. */
function SellForm({
  asset,
  today,
  onDone,
  onCancel,
}: {
  asset: ManualAsset;
  today: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(today);
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (price.trim() === "" || !(Number(price) >= 0))
      return toast.error("매도가를 입력하세요.");
    startTransition(async () => {
      const res = await sellManualAsset(asset.id, {
        salePrice: Number(price),
        saleAt: date,
        saleCost: cost.trim() === "" ? undefined : Number(cost),
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("매도를 기록했어요");
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">매도 · {asset.name}</p>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
      />
      <input
        inputMode="numeric"
        placeholder="매도가 (원)"
        value={price}
        onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums"
      />
      <input
        inputMode="numeric"
        placeholder="세금·비용 (원) — 양도세·중개 등, 모르면 비움"
        value={cost}
        onChange={(e) => setCost(e.target.value.replace(/[^0-9]/g, ""))}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground"
        >
          매도 기록
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium"
        >
          취소
        </button>
      </div>
    </div>
  );
}
