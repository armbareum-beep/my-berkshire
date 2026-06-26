"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { BROKERS, findBroker, brokerLogoSrcs } from "@/lib/config/brokers";
import { LogoImage } from "@/components/ui/LogoImage";

/** 소수 율 → % 문자열. 0.00015 → "0.015". */
export function rateToPct(rate: number): string {
  return String(Math.round(rate * 100 * 10000) / 10000);
}

/**
 * 증권사 칩 — 종목 로고와 동일 파이프라인(셀프 호스팅 → 도메인 favicon)으로 증권사 로고를
 * 표시하고, 모두 실패하면 이니셜 + 브랜드 컬러 배지로 폴백.
 */
export function BrokerChip({ id, size = 40 }: { id: string; size?: number }) {
  const b = findBroker(id);
  if (!b) return null;
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary"
      style={{ width: size, height: size }}
      title={b.name}
    >
      <LogoImage
        srcs={brokerLogoSrcs(b)}
        alt={b.name}
        fit="inset"
        resetKey={b.id}
        fallback={
          <span
            className="flex h-full w-full items-center justify-center text-sm font-bold text-white"
            style={{ backgroundColor: b.color }}
          >
            {b.name.slice(0, 1)}
          </span>
        }
      />
    </span>
  );
}

/**
 * 증권사 드롭다운 + 수수료율(자동입력·편집가능).
 * 증권사를 고르면 대표 수수료율이 % 칸에 자동 채워진다("대표값" 안내).
 */
export function BrokerSelect({
  broker,
  pct,
  onBroker,
  onPct,
}: {
  broker: string | null;
  pct: string;
  onBroker: (id: string | null) => void;
  onPct: (pct: string) => void;
}) {
  // 수수료 직접 수정 펼침 여부. 증권사 선택 시엔 자동값 → 평소 숨김(머리 안 쓰게).
  const [manualOpen, setManualOpen] = useState(false);
  const b = findBroker(broker);
  // 입력칸 노출: "직접 입력"(증권사 미지정)이거나, 사용자가 수정을 펼친 경우만.
  const showInput = !b || manualOpen;

  return (
    <div>
      <label className="block text-sm font-medium">증권사</label>
      <div className="mt-2 flex items-center gap-2">
        {broker && <BrokerChip id={broker} size={36} />}
        <select
          value={broker ?? ""}
          onChange={(e) => {
            const id = e.target.value || null;
            onBroker(id);
            const picked = findBroker(id);
            if (picked) onPct(rateToPct(picked.commissionRate)); // 대표 수수료 자동입력
            setManualOpen(false); // 새로 고르면 자동값 보기로
          }}
          className="h-12 flex-1 rounded-xl bg-secondary px-3 text-sm font-semibold text-secondary-foreground"
        >
          <option value="">직접 입력</option>
          {BROKERS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>
      </div>

      {b && !showInput ? (
        // 증권사 선택됨 → 수수료 자동(읽기전용) + 필요 시 직접 수정
        <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary px-3 py-2.5">
          <span className="text-sm">
            수수료 <span className="font-bold tabular-nums">{pct}%</span>{" "}
            <span className="text-muted-foreground">· {b.name} 대표값</span>
          </span>
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="text-xs text-muted-foreground underline"
          >
            직접 수정
          </button>
        </div>
      ) : (
        <>
          <label className="mt-3 block text-sm font-medium">
            위탁수수료율 (%)
          </label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.001"
            value={pct}
            onChange={(e) => onPct(e.target.value)}
            className="mt-2 h-12"
            placeholder="예: 0.015"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {b
              ? "이벤트·할인 등 대표값과 다르면 직접 입력하세요."
              : "기타 증권사는 직접 입력. 비우면 0.015%."}
          </p>
        </>
      )}
    </div>
  );
}
