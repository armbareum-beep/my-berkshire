"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberPadField } from "@/components/ui/NumberPad";
import {
  addLiability,
  updateLiability,
  type LiabilityInput,
} from "@/app/networth/actions";
import {
  LIABILITY_KINDS,
  LIABILITY_KIND_LABEL,
  LIABILITY_KIND_DESC,
  type Liability,
  type LiabilityKind,
} from "@/lib/finance/liabilities";

/**
 * 부채 등록/수정 폼 — 거래 플로우(인라인)와 순자산 페이지가 공용으로 쓴다.
 * 입력·저장은 ₩ 기준. 바깥 chrome(카드/테두리)은 호출 측이 감싼다.
 */
export function LiabilityForm({
  editing,
  today,
  assets = [],
  defaultKind,
  defaultAssetId,
  onSaved,
  onCancel,
}: {
  /** 수정 대상(있으면 edit 모드, 없으면 신규 등록). */
  editing?: Liability | null;
  today: string;
  /** 연결 후보 부동산(id·이름). 비어 있으면 연결 UI 숨김(spec 012). */
  assets?: { id: string; name: string }[];
  /** 신규 등록 시 기본 종류(예: 부동산에서 열면 MORTGAGE). */
  defaultKind?: LiabilityKind;
  /** 신규 등록 시 미리 연결할 부동산 id(예: 물건 행에서 "대출" 열 때). */
  defaultAssetId?: string;
  /** 저장 성공 후(목록 새로고침 또는 페이지 이동). */
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(editing?.name ?? "");
  const [kind, setKind] = useState<LiabilityKind>(
    editing?.kind ?? defaultKind ?? "CREDIT",
  );
  const [principal, setPrincipal] = useState(
    editing ? String(editing.principal) : "",
  );
  const [interestPct, setInterestPct] = useState(
    editing?.interestRate ? String(editing.interestRate * 100) : "",
  );
  const [startedAt, setStartedAt] = useState(editing?.startedAt ?? "");
  const [manualAssetId, setManualAssetId] = useState(
    editing?.manualAssetId ?? defaultAssetId ?? "",
  );

  function submit() {
    const input: LiabilityInput = {
      name,
      kind,
      principal: Number(principal) || 0,
      interestPct: Number(interestPct) || 0,
      startedAt: startedAt || undefined,
      manualAssetId: kind === "MORTGAGE" ? manualAssetId || null : null,
    };
    if (!input.name.trim()) {
      toast.error("부채 이름을 입력하세요.");
      return;
    }
    startTransition(async () => {
      const res = editing
        ? await updateLiability(editing.id, input)
        : await addLiability(input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(editing ? "수정되었습니다" : "부채가 등록되었습니다");
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
          placeholder="예: 신한 신용대출"
          className="mt-1 h-11"
        />
      </div>

      <div>
        <label className="text-sm font-medium">종류</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {LIABILITY_KINDS.map((k) => (
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
              {LIABILITY_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {LIABILITY_KIND_DESC[kind]}
        </p>
      </div>

      <NumberPadField
        label="현재 잔액 (원)"
        value={principal}
        onChange={setPrincipal}
        prefix="₩"
        placeholder="탭해서 잔액 입력"
      />

      <div className="flex gap-3">
        <NumberPadField
          className="flex-1"
          label="연이율 (%, 선택)"
          value={interestPct}
          onChange={setInterestPct}
          suffix="%"
          decimal
          placeholder="예: 5.2"
        />
        <div className="flex-1">
          <label className="text-sm font-medium">
            차입일 <span className="text-muted-foreground">(선택)</span>
          </label>
          <Input
            type="date"
            max={today}
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            className="mt-1 h-11"
          />
        </div>
      </div>

      {/* 담보대출 ↔ 부동산 연결(선택). 후보 자산이 있을 때만 노출(spec 012). */}
      {kind === "MORTGAGE" && assets.length > 0 && (
        <div>
          <label className="text-sm font-medium">
            연결 부동산 <span className="text-muted-foreground">(선택)</span>
          </label>
          <select
            value={manualAssetId}
            onChange={(e) => setManualAssetId(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-border bg-card px-3 text-sm"
          >
            <option value="">연결 안 함 (사업부 공통)</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            연결하면 이 대출 이자가 그 물건 수익에서 차감돼요.
          </p>
        </div>
      )}

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
