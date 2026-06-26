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
import {
  MANUAL_ASSET_KINDS,
  MANUAL_ASSET_KIND_LABEL,
  MANUAL_ASSET_KIND_DESC,
  MANUAL_ASSET_KIND_EMOJI,
  MANUAL_ASSET_DIVISION,
  type ManualAsset,
  type ManualAssetKind,
} from "@/lib/finance/realAssets";

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

  function buildInput(): ManualAssetInput {
    return {
      name,
      kind: kind as ManualAssetKind,
      currentValue: Number(currentValue) || 0,
      acquiredPrice: acquiredPrice.trim() === "" ? null : Number(acquiredPrice),
      acquiredAt: acquiredAt || undefined,
      note: note || undefined,
      acquisitionCost:
        acquisitionCost.trim() === "" ? null : Number(acquisitionCost),
      valuationSource: valuationSource || undefined,
      valuedAt: valuedAt || undefined,
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
