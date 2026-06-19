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
import {
  MANUAL_ASSET_KINDS,
  MANUAL_ASSET_KIND_LABEL,
  MANUAL_ASSET_KIND_DESC,
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
  defaultKind = "REAL_ESTATE",
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
  const [kind, setKind] = useState<ManualAssetKind>(editing?.kind ?? defaultKind);
  const [currentValue, setCurrentValue] = useState(
    editing ? String(editing.currentValue) : "",
  );
  const [acquiredPrice, setAcquiredPrice] = useState(
    editing?.acquiredPrice != null ? String(editing.acquiredPrice) : "",
  );
  const [acquiredAt, setAcquiredAt] = useState(editing?.acquiredAt ?? "");
  const [note, setNote] = useState(editing?.note ?? "");

  function submit() {
    const input: ManualAssetInput = {
      name,
      kind,
      currentValue: Number(currentValue) || 0,
      acquiredPrice: acquiredPrice.trim() === "" ? null : Number(acquiredPrice),
      acquiredAt: acquiredAt || undefined,
      note: note || undefined,
    };
    if (!input.name.trim()) {
      toast.error("자산 이름을 입력하세요.");
      return;
    }
    if (!(input.currentValue > 0)) {
      toast.error("현재 평가액을 입력하세요.");
      return;
    }
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

  return (
    <div className="flex flex-col gap-3">
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
        <label className="text-sm font-medium">종류</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {MANUAL_ASSET_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={
                "rounded-full px-3 py-1.5 text-sm font-semibold " +
                (kind === k
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground")
              }
            >
              {MANUAL_ASSET_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {MANUAL_ASSET_KIND_DESC[kind]}
        </p>
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

      <div className="flex gap-2">
        <Button
          onClick={submit}
          disabled={pending}
          className="h-11 flex-1 bg-primary font-semibold text-primary-foreground"
        >
          {pending ? "기록 중…" : editing ? "수정 저장" : "등록"}
        </Button>
        <Button
          variant="secondary"
          onClick={onCancel}
          disabled={pending}
          className="h-11 px-5 font-semibold"
        >
          취소
        </Button>
      </div>
    </div>
  );
}
