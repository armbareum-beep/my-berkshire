"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { moneyShort } from "@/lib/format";
import { LAWD_CODES, SIDO_LIST } from "@/lib/finance/rtms/lawdCodes";
import {
  RTMS_PROPERTY_TYPES,
  RTMS_PROPERTY_TYPE_LABEL,
  type RtmsDeal,
  type RtmsPropertyType,
} from "@/lib/finance/rtms/parse";

/** 실거래가 방식에서 폼이 저장할 선택 결과 — 매칭키 + 선택 당시 거래. */
export interface RtmsSelection {
  lawdCd: string;
  propertyType: RtmsPropertyType;
  complexName: string;
  /** 전용면적(㎡). */
  exclusiveArea: number;
  /** 선택 거래가(₩) — 폼의 현재 평가액 초기값. */
  amountKrw: number;
  /** 선택 거래 계약일 — 폼의 평가일 초기값. */
  dealDate: string;
}

/**
 * 국토부 실거래 선택 블록 — 지역(시/도→시군구) → 유형 → 단지 검색 → 거래 탭 선택.
 * 선택되면 요약 카드로 접히고 "다시 선택"으로 재검색. 검색은 SymbolSearch 와 동일한
 * 300ms 디바운스 + AbortController 취소 패턴으로 /api/rtms/deals 를 호출한다.
 */
export function RtmsDealPicker({
  value,
  onSelect,
}: {
  value: RtmsSelection | null;
  onSelect: (sel: RtmsSelection) => void;
}) {
  const [expanded, setExpanded] = useState(value == null);
  const [sido, setSido] = useState(
    value ? LAWD_CODES.find((c) => c.code === value.lawdCd)?.sido ?? "" : "",
  );
  const [lawdCd, setLawdCd] = useState(value?.lawdCd ?? "");
  const [propertyType, setPropertyType] = useState<RtmsPropertyType>(
    value?.propertyType ?? "APT",
  );
  const [query, setQuery] = useState("");
  const [deals, setDeals] = useState<RtmsDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sigunguList = LAWD_CODES.filter((c) => c.sido === sido);

  // 지역·유형이 정해지면 목록 조회(검색어는 서버 필터). 300ms 디바운스 + 요청 취소.
  useEffect(() => {
    if (!expanded || !/^\d{5}$/.test(lawdCd)) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/rtms/deals?lawdCd=${lawdCd}&type=${propertyType}&q=${encodeURIComponent(query.trim())}`,
          { signal: ctrl.signal },
        );
        const json = (await res.json()) as { deals?: RtmsDeal[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setDeals(json.deals ?? []);
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setDeals([]);
          setError(e instanceof Error ? e.message : "실거래 조회에 실패했어요.");
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [expanded, lawdCd, propertyType, query]);

  // 선택 완료 → 요약 카드
  if (!expanded && value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {value.complexName} {value.exclusiveArea}㎡
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            선택 실거래 {moneyShort(value.amountKrw)} · {value.dealDate}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="ml-2 shrink-0"
          onClick={() => setExpanded(true)}
        >
          다시 선택
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <p className="text-sm font-medium">실거래 선택</p>
      <div className="flex gap-2">
        <select
          value={sido}
          onChange={(e) => {
            setSido(e.target.value);
            setLawdCd("");
            setDeals([]);
          }}
          className="h-11 flex-1 rounded-lg border border-border bg-card px-3 text-sm"
          aria-label="시/도"
        >
          <option value="">시/도</option>
          {SIDO_LIST.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={lawdCd}
          onChange={(e) => setLawdCd(e.target.value)}
          disabled={!sido}
          className="h-11 flex-1 rounded-lg border border-border bg-card px-3 text-sm disabled:opacity-50"
          aria-label="시/군/구"
        >
          <option value="">시/군/구</option>
          {sigunguList.map((c) => (
            <option key={c.code} value={c.code}>
              {c.sigungu}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {RTMS_PROPERTY_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setPropertyType(t)}
            className={
              "rounded-xl px-1 py-2 text-xs font-semibold " +
              (propertyType === t
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground")
            }
          >
            {RTMS_PROPERTY_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {lawdCd && (
        <>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="단지명 검색 (예: 래미안)"
            className="h-11"
          />
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : loading ? (
            <p className="text-xs text-muted-foreground">최근 3개월 실거래 조회 중…</p>
          ) : deals.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              최근 3개월 내 실거래가 없어요. 지역·유형·검색어를 확인해 주세요.
            </p>
          ) : (
            <ul className="max-h-56 overflow-y-auto rounded-lg border border-border">
              {deals.map((d, i) => (
                <li key={`${d.name}-${d.date}-${i}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect({
                        lawdCd,
                        propertyType,
                        complexName: d.name,
                        exclusiveArea: d.area,
                        amountKrw: d.amountKrw,
                        dealDate: d.date,
                      });
                      setExpanded(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-secondary"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {d.name} {d.area}㎡{d.floor != null ? ` · ${d.floor}층` : ""}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {d.dong} · {d.date}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold">
                      {moneyShort(d.amountKrw)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            내 집과 같은 단지·면적의 거래를 선택하면 그 가격이 평가액이 돼요. 이후 새
            실거래가 나오면 자동으로 갱신돼요.
          </p>
        </>
      )}
    </div>
  );
}
