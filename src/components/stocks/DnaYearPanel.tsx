"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  setManualFundamentals,
  clearManualFundamentals,
} from "@/app/stocks/[symbol]/actions";
import { wonCompact } from "@/lib/format";

export interface YearRow {
  year: number;
  dna: number | null;
  maintCapex: number | null;
  /** 그 해 DART 총CapEx(플레이스홀더·보수적 기본 안내). */
  totalCapex: number | null;
  /** 그 해 출처 제공 D&A(미국 EDGAR). 있으면 D&A 는 자동 → 유지CapEx 만 받음. */
  autoDna: number | null;
}

/**
 * 연도별 입력 패널 — 다년 정규화 오너이익용.
 * autoDna=false(한국 DART): 감가상각(D&A) 수기 입력이 게이트, 유지CapEx 는 선택.
 * autoDna=true(미국 EDGAR): D&A 는 자동 → 유지CapEx 수기 입력이 게이트(총CapEx 자동 폴백 안 함).
 */
export function DnaYearPanel({
  symbol,
  rows,
  autoDna = false,
}: {
  symbol: string;
  rows: YearRow[];
  autoDna?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openYear, setOpenYear] = useState<number | null>(null);

  const filled = rows.filter((r) =>
    autoDna ? r.maintCapex != null : r.dna != null,
  ).length;

  return (
    <div className="mt-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">
          {autoDna ? "연도별 유지CapEx 입력" : "연도별 감가상각(D&A) 입력"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {filled}/{rows.length}년 입력됨
        </p>
      </div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
        {autoDna
          ? "감가상각(D&A)은 공시에서 자동으로 와요. 유지(maintenance)CapEx 만 넣으면 그 해 오너이익이 잡혀요 — 비우면 자동 계산 안 해요."
          : "각 해 사업보고서 주석의 (유형+무형+사용권) 상각 합. D&A 가 있는 해만 오너이익 평균에 들어가요."}
      </p>

      <ul className="mt-2 divide-y divide-border/60">
        {rows.map((r) => (
          <YearItem
            key={r.year}
            symbol={symbol}
            row={r}
            autoDna={autoDna}
            open={openYear === r.year}
            onToggle={() => setOpenYear(openYear === r.year ? null : r.year)}
            onDone={() => {
              setOpenYear(null);
              router.refresh();
            }}
            pending={pending}
            start={start}
          />
        ))}
      </ul>
    </div>
  );
}

function YearItem({
  symbol,
  row,
  autoDna,
  open,
  onToggle,
  onDone,
  pending,
  start,
}: {
  symbol: string;
  row: YearRow;
  autoDna: boolean;
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
  pending: boolean;
  start: (cb: () => Promise<void> | void) => void;
}) {
  const [dna, setDna] = useState(row.dna != null ? String(row.dna) : "");
  const [maint, setMaint] = useState(
    row.maintCapex != null ? String(row.maintCapex) : "",
  );

  // autoDna(미국): 유지CapEx 입력 여부가 채움 기준. 한국: D&A 입력 여부.
  const isFilled = autoDna ? row.maintCapex != null : row.dna != null;

  function save() {
    const dnaN = autoDna ? row.dna : dna.trim() === "" ? null : Number(dna);
    const maintN = maint.trim() === "" ? null : Number(maint);
    if (dnaN != null && !(dnaN >= 0)) {
      toast.error("감가상각비(원)를 올바르게 입력하세요.");
      return;
    }
    if (maintN != null && !(maintN >= 0)) {
      toast.error("유지CapEx(원)를 올바르게 입력하세요.");
      return;
    }
    if (autoDna && maintN == null) {
      toast.error("유지CapEx(원)를 입력하세요.");
      return;
    }
    start(async () => {
      const res = await setManualFundamentals(
        symbol,
        { dna: dnaN, maintCapex: maintN },
        row.year,
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${row.year}년 저장됨`);
      onDone();
    });
  }
  function clear() {
    start(async () => {
      const res = await clearManualFundamentals(symbol, row.year);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${row.year}년 삭제됨`);
      setDna("");
      setMaint("");
      onDone();
    });
  }

  return (
    <li className="py-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left text-xs"
      >
        <span className="font-medium tabular-nums">{row.year}</span>
        <span className="text-muted-foreground tabular-nums">
          {autoDna ? (
            row.maintCapex != null ? (
              <>유지CapEx {wonCompact(row.maintCapex)}</>
            ) : (
              <span className="text-primary">미입력 · 입력하기</span>
            )
          ) : row.dna != null ? (
            <>
              D&A {wonCompact(row.dna)}
              {row.maintCapex != null && ` · 유지CapEx ${wonCompact(row.maintCapex)}`}
            </>
          ) : (
            <span className="text-primary">미입력 · 입력하기</span>
          )}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {autoDna ? (
            <div className="rounded-lg bg-secondary/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              감가상각 D&A{" "}
              <span className="font-medium tabular-nums text-foreground">
                {row.autoDna != null ? wonCompact(row.autoDna) : "—"}
              </span>{" "}
              · 공시 자동
            </div>
          ) : (
            <div>
              <label className="text-[11px] text-muted-foreground">감가상각 D&A (원)</label>
              <Input
                type="number"
                inputMode="numeric"
                autoFocus
                value={dna}
                onChange={(e) => setDna(e.target.value)}
                placeholder="예: 40000000000000"
                className="mt-1 h-9"
              />
            </div>
          )}
          <div>
            <label className="text-[11px] text-muted-foreground">
              유지CapEx (원){autoDna ? "" : " · 선택"}
              {row.totalCapex != null &&
                (autoDna
                  ? ` · 총CapEx ${wonCompact(row.totalCapex)}`
                  : ` · 비우면 총CapEx ${wonCompact(row.totalCapex)}`)}
            </label>
            <Input
              type="number"
              inputMode="numeric"
              autoFocus={autoDna}
              value={maint}
              onChange={(e) => setMaint(e.target.value)}
              placeholder={autoDna ? "유지CapEx 입력" : "비우면 총CapEx(보수적)"}
              className="mt-1 h-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={save}
              disabled={pending}
              className="h-9 flex-1 bg-primary text-xs font-semibold text-primary-foreground"
            >
              저장
            </Button>
            {isFilled && (
              <Button
                variant="secondary"
                onClick={clear}
                disabled={pending}
                className="h-9 px-3 text-xs"
              >
                삭제
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
