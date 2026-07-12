"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberPadField } from "@/components/ui/NumberPad";
import {
  addManualAsset,
  updateManualAsset,
  type ManualAssetInput,
} from "@/app/networth/actions";
import { CardPickerField } from "@/components/ui/CardPickerField";
import { RtmsDealPicker, type RtmsSelection } from "@/components/networth/RtmsDealPicker";
import type { RtmsPropertyType } from "@/lib/finance/rtms/parse";
import {
  MANUAL_ASSET_KINDS,
  MANUAL_ASSET_KIND_LABEL,
  MANUAL_ASSET_KIND_DESC,
  MANUAL_ASSET_KIND_EMOJI,
  MANUAL_ASSET_DIVISION,
  ASSET_DIVISION_PRODUCES_INCOME,
  assetDivision,
  capRateValue,
  type ManualAsset,
  type ManualAssetKind,
} from "@/lib/finance/realAssets";

type ValuationMethod = "direct" | "cap_rate" | "transaction_comp";

const VALUATION_METHOD_LABEL: Record<ValuationMethod, string> = {
  direct: "직접 입력",
  cap_rate: "수익률환원법",
  transaction_comp: "실거래가",
};

/** RTMS 실거래가 매칭 대상 종류 — 아파트·빌라·오피스텔·분양권이 속하는 부동산 계열. */
const RTMS_KINDS: ManualAssetKind[] = ["REAL_ESTATE", "COMMERCIAL"];

/** 수정 모드에서 저장된 rtms 매칭키 → 선택 상태 복원. */
function rtmsSelectionOf(editing: ManualAsset | null | undefined): RtmsSelection | null {
  if (
    editing?.valuationMethod !== "transaction_comp" ||
    !editing.rtmsLawdCd ||
    !editing.rtmsPropertyType ||
    !editing.rtmsComplexName ||
    editing.rtmsExclusiveArea == null
  )
    return null;
  return {
    lawdCd: editing.rtmsLawdCd,
    propertyType: editing.rtmsPropertyType as RtmsPropertyType,
    complexName: editing.rtmsComplexName,
    exclusiveArea: editing.rtmsExclusiveArea,
    amountKrw: editing.currentValue,
    dealDate: editing.valuedAt ?? "",
  };
}

/**
 * 수기 평가 자산 등록/수정 폼 — 거래 플로우(인라인)와 순자산 페이지 공용.
 * 입력·저장 ₩. 바깥 chrome 은 호출 측이 감싼다.
 * 등록 성공 시 "사업부 신설" 성취 토스트(게이미피케이션).
 */
export function ManualAssetForm({
  editing,
  today,
  defaultKind,
  onSaved,
  onCancel,
}: {
  editing?: ManualAsset | null;
  today: string;
  defaultKind?: ManualAssetKind;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(editing?.name ?? "");
  // null = 아직 종류 미선택(단계형): 고르기 전엔 나머지 입력을 숨긴다.
  const [kind, setKind] = useState<ManualAssetKind | null>(
    editing?.kind ?? defaultKind ?? null,
  );
  const [currentValue, setCurrentValue] = useState(
    editing ? String(editing.currentValue) : "",
  );
  const [acquiredPrice, setAcquiredPrice] = useState(
    editing?.acquiredPrice != null ? String(editing.acquiredPrice) : "",
  );
  const [acquiredAt, setAcquiredAt] = useState(editing?.acquiredAt ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [acquisitionCost, setAcquisitionCost] = useState(
    editing?.acquisitionCost != null ? String(editing.acquisitionCost) : "",
  );
  const [valuationSource, setValuationSource] = useState(
    editing?.valuationSource ?? "",
  );
  const [valuedAt, setValuedAt] = useState(editing?.valuedAt ?? "");
  const [valuationMethod, setValuationMethod] = useState<ValuationMethod>(
    editing?.valuationMethod ?? "direct",
  );
  const [capRateInput, setCapRateInput] = useState(
    editing?.capRate != null ? String(editing.capRate * 100) : "",
  );
  const [rtmsSel, setRtmsSel] = useState<RtmsSelection | null>(rtmsSelectionOf(editing));
  // 첫 임대수익(신규 cap_rate 등록 시에만 노출 — 수정 시 별도 임대 입력 사용)
  const [incomeDate, setIncomeDate] = useState(today);
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeCost, setIncomeCost] = useState("");

  const producesIncome = kind != null && ASSET_DIVISION_PRODUCES_INCOME[assetDivision(kind)];
  // 실거래가(거래사례비교법)는 RTMS API 가 커버하는 부동산 계열에서만.
  const allowsRtms = kind != null && RTMS_KINDS.includes(kind);
  const methods: ValuationMethod[] = [
    "direct",
    ...(producesIncome ? (["cap_rate"] as const) : []),
    ...(allowsRtms ? (["transaction_comp"] as const) : []),
  ];
  const isCapRate = valuationMethod === "cap_rate" && producesIncome;
  const isTxComp = valuationMethod === "transaction_comp" && allowsRtms;
  const isNew = !editing;

  function buildInput(): ManualAssetInput {
    const capRateDec = capRateInput.trim() === "" ? null : Number(capRateInput) / 100;
    const monthlyAmt = Number(incomeAmount) || 0;
    // 월임대료 × 12 = 연간 합산으로 저장. 환원법 분모는 연간 순수익이므로.
    const initialIncome =
      isNew && isCapRate && monthlyAmt > 0 && incomeDate
        ? { date: incomeDate, amount: monthlyAmt * 12, cost: (Number(incomeCost) || 0) * 12 }
        : null;
    return {
      name,
      kind: kind as ManualAssetKind,
      currentValue: isCapRate ? 0 : Number(currentValue) || 0,
      acquiredPrice: acquiredPrice.trim() === "" ? null : Number(acquiredPrice),
      acquiredAt: acquiredAt || undefined,
      note: note || undefined,
      acquisitionCost:
        acquisitionCost.trim() === "" ? null : Number(acquisitionCost),
      valuationSource: valuationSource || undefined,
      valuedAt: valuedAt || undefined,
      valuationMethod: isCapRate ? "cap_rate" : isTxComp ? "transaction_comp" : "direct",
      capRate: isCapRate ? capRateDec : null,
      initialIncome,
      rtms:
        isTxComp && rtmsSel
          ? {
              lawdCd: rtmsSel.lawdCd,
              propertyType: rtmsSel.propertyType,
              complexName: rtmsSel.complexName,
              exclusiveArea: rtmsSel.exclusiveArea,
            }
          : null,
    };
  }

  function doSubmit() {
    if (!kind) return;
    const input = buildInput();
    startTransition(async () => {
      const res = editing
        ? await updateManualAsset(editing.id, input)
        : await addManualAsset(input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // 신규 등록은 "사업부 신설" 성취로(게이미피케이션). 수정은 담백하게.
      if (editing) {
        toast.success("수정되었습니다");
      } else {
        toast.success(`${MANUAL_ASSET_DIVISION[kind]} 신설!`, {
          description: "순자산에 반영됐어요. (투자 수익률엔 영향 없음)",
        });
      }
      onSaved();
    });
  }

  function submit() {
    if (!name.trim()) {
      toast.error("자산 이름을 입력하세요.");
      return;
    }
    if (isCapRate) {
      const rate = Number(capRateInput);
      if (!(rate > 0)) {
        toast.error("환원율(%)을 입력하세요. 예: 4.5");
        return;
      }
      doSubmit();
      return;
    }
    if (isTxComp) {
      if (!rtmsSel) {
        toast.error("실거래 단지를 선택하세요.");
        return;
      }
      // 실거래가는 시장가라 평가손실 확인(FR-006) 생략 — 직접입력 오타 방지용이므로.
      doSubmit();
      return;
    }
    const cur = Number(currentValue) || 0;
    if (!(cur > 0)) {
      toast.error("현재 평가액을 입력하세요.");
      return;
    }
    // 입력 안전장치(FR-006) — 현재가 < 매입가면 평가손실 확인.
    const acq = acquiredPrice.trim() === "" ? null : Number(acquiredPrice);
    if (acq != null && cur < acq) {
      toast("현재가가 매입가보다 낮아요 — 평가손실이 맞나요?", {
        description: "매입가/현재가를 바꿔 입력하지 않았는지 확인하세요.",
        action: { label: "맞아요, 저장", onClick: doSubmit },
      });
      return;
    }
    doSubmit();
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-sm font-medium">종류</label>
        <CardPickerField
          value={kind}
          onChange={setKind}
          items={MANUAL_ASSET_KINDS}
          getLabel={(k) => MANUAL_ASSET_KIND_LABEL[k]}
          getDescription={(k) => MANUAL_ASSET_KIND_DESC[k]}
          getEmoji={(k) => MANUAL_ASSET_KIND_EMOJI[k]}
          ariaLabel="자산 종류"
          className="mt-1"
        />
      </div>

      {kind !== null && (
        <>
          <div>
            <label className="text-sm font-medium">이름</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 마포 자가"
              className="mt-1 h-11"
            />
          </div>

      {methods.length > 1 && (
        <div>
          <p className="mb-1 text-sm font-medium">평가 방법</p>
          <div className={"grid gap-2 " + (methods.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
            {methods.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setValuationMethod(m)}
                className={
                  "rounded-xl px-3 py-2.5 text-sm font-semibold " +
                  (valuationMethod === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground")
                }
              >
                {VALUATION_METHOD_LABEL[m]}
              </button>
            ))}
          </div>
          {isCapRate && (
            <p className="mt-1 text-xs text-muted-foreground">
              평가액 = 최근 12개월 순임대수익 ÷ 환원율
            </p>
          )}
          {isTxComp && (
            <p className="mt-1 text-xs text-muted-foreground">
              같은 단지·비슷한 면적의 국토부 실거래가로 평가해요 (매월 자동 갱신)
            </p>
          )}
        </div>
      )}

      {isCapRate ? (
        <>
          <div>
            <label className="text-sm font-medium">환원율 (%)</label>
            <div className="relative mt-1">
              <input
                type="number"
                min="0.1"
                max="20"
                step="0.1"
                value={capRateInput}
                onChange={(e) => setCapRateInput(e.target.value)}
                placeholder="예: 4.5"
                className="h-11 w-full rounded-xl border border-input bg-card px-3 pr-8 text-base outline-none"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              평가액 = 최근 12개월 순임대수익 ÷ 환원율
            </p>
          </div>

          {isNew && (
            <div className="rounded-xl border border-border p-3">
              <p className="text-sm font-medium">첫 임대수익 기록 <span className="text-muted-foreground font-normal">(선택)</span></p>
              <p className="mt-0.5 text-xs text-muted-foreground">월임대료 입력 → 연간(×12)으로 환산해 평가액을 바로 계산해요.</p>
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex gap-2">
                  <NumberPadField
                    className="flex-1"
                    label="월 임대료 (원)"
                    value={incomeAmount}
                    onChange={setIncomeAmount}
                    prefix="₩"
                    placeholder="예: 50만"
                  />
                  <NumberPadField
                    className="flex-1"
                    label="월 비용 (원, 선택)"
                    value={incomeCost}
                    onChange={setIncomeCost}
                    prefix="₩"
                    placeholder="관리비·세금"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">받은 날</label>
                  <Input
                    type="date"
                    max={today}
                    value={incomeDate}
                    onChange={(e) => setIncomeDate(e.target.value)}
                    className="mt-1 h-11"
                  />
                </div>
              </div>
            </div>
          )}
        </>
      ) : isTxComp ? (
        <RtmsDealPicker
          value={rtmsSel}
          onSelect={(sel) => {
            setRtmsSel(sel);
            // 선택 거래가 → 평가액·평가일·출처 자동 채움(이후 cron/수동 갱신이 이어감).
            setCurrentValue(String(sel.amountKrw));
            if (sel.dealDate) setValuedAt(sel.dealDate);
            setValuationSource("국토부 실거래가");
          }}
        />
      ) : (
        <div>
          <NumberPadField
            label="현재 평가액 (원)"
            value={currentValue}
            onChange={setCurrentValue}
            prefix="₩"
            placeholder="탭해서 평가액 입력"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            시세가 없어 직접 입력해요. 값이 바뀌면 여기서 수정하면 순자산에 반영돼요.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <NumberPadField
          className="flex-1"
          label="취득가 (원, 선택)"
          value={acquiredPrice}
          onChange={setAcquiredPrice}
          prefix="₩"
          placeholder="예: 6억"
        />
        <div className="flex-1">
          <label className="text-sm font-medium">
            취득일 <span className="text-muted-foreground">(선택)</span>
          </label>
          <Input
            type="date"
            max={today}
            value={acquiredAt}
            onChange={(e) => setAcquiredAt(e.target.value)}
            className="mt-1 h-11"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <NumberPadField
          className="flex-1"
          label="취득 부대비용 (원, 선택)"
          value={acquisitionCost}
          onChange={setAcquisitionCost}
          prefix="₩"
          placeholder="취득세·중개 등 한번에"
        />
        <div className="flex-1">
          <label className="text-sm font-medium">
            평가일 <span className="text-muted-foreground">(선택)</span>
          </label>
          <Input
            type="date"
            max={today}
            value={valuedAt}
            onChange={(e) => setValuedAt(e.target.value)}
            className="mt-1 h-11"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">
          평가 출처 <span className="text-muted-foreground">(선택)</span>
        </label>
        <Input
          value={valuationSource}
          onChange={(e) => setValuationSource(e.target.value)}
          placeholder="예: KB시세 · 실거래가 · 감정가"
          className="mt-1 h-11"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          추정 평가라 출처를 남겨두면 더 정직해요.
        </p>
      </div>

        </>
      )}

      <div className="flex gap-2">
        {kind !== null && (
          <Button
            onClick={submit}
            disabled={pending}
            className="h-11 flex-1 bg-primary font-semibold text-primary-foreground"
          >
            {pending ? "기록 중…" : editing ? "수정 저장" : "등록"}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={onCancel}
          disabled={pending}
          className={"h-11 font-semibold " + (kind !== null ? "px-5" : "flex-1")}
        >
          취소
        </Button>
      </div>
    </div>
  );
}
