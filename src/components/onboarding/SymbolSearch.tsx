"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { SymbolAvatar } from "./SymbolPicker";
import { CATALOG, type CatalogItem } from "@/lib/finance/catalog";
import { assetTypeOf } from "@/lib/securities";
import { searchSymbols, type SymbolSearchResult } from "@/lib/finance/search";

/** 자산유형 필터 칩. */
const FILTERS = ["전체", "주식", "ETF", "코인", "원자재"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * 종목 검색 — 토스증권식. 빈 입력이면 추천(카탈로그), 입력하면 야후 검색(디바운스 300ms).
 * 결과에 자산유형 뱃지 + 유형 필터 칩. 시세 없는 자산(부동산·실물·대체)은 "직접 추가"로.
 * onSelect 는 기존 SymbolPicker 와 동일한 {symbol, name} 을 넘긴다(드롭인 교체).
 */
export function SymbolSearch({
  onSelect,
  manualAssetHref,
  onManualAsset,
}: {
  onSelect: (item: CatalogItem) => void;
  /** 시세 없는 자산 "직접 추가" 링크 대상. 없으면 링크 숨김(예: 온보딩). */
  manualAssetHref?: string;
  /** 인라인 "직접 추가" 콜백(거래 플로우). 주어지면 href 대신 이 폼을 연다. */
  onManualAsset?: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SymbolSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("전체");

  useEffect(() => {
    const query = q.trim();
    // 빈 질의는 추천(카탈로그) 렌더로 처리 — 동기 setState 없이 그냥 종료.
    if (!query) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await searchSymbols(query, ctrl.signal);
      if (!ctrl.signal.aborted) {
        setResults(r);
        setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const showCatalog = q.trim() === "";
  // 추천(빈 검색)은 짧게 — 전체는 유형별 대표 1개씩(4개), 유형 필터는 그 유형 최대 4개.
  // 길게 늘어놓으면 매수 버튼이 묻혀서. 더 많은 종목은 검색으로(입력=야후 검색).
  const catalogItems: SymbolSearchResult[] = CATALOG.map((c) => ({
    symbol: c.symbol,
    name: c.name,
    exchange: null,
    assetType: c.assetType ?? assetTypeOf(null, c.symbol),
    ter: c.ter,
  }));
  const typeOf = (it: SymbolSearchResult) => it.assetType ?? "주식";
  const recommended: SymbolSearchResult[] = (
    ["주식", "ETF", "코인", "원자재"] as const
  )
    .map((t) => catalogItems.find((it) => typeOf(it) === t))
    .filter((x): x is SymbolSearchResult => !!x);

  const items: SymbolSearchResult[] = showCatalog
    ? filter === "전체"
      ? recommended
      : catalogItems.filter((it) => typeOf(it) === filter).slice(0, 4)
    : filter === "전체"
      ? (results ?? [])
      : (results ?? []).filter((it) => typeOf(it) === filter);

  return (
    <div className="flex flex-col gap-3">
      <Input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="종목·코인 검색 (예: 삼성전자, AAPL, 비트코인)"
        className="h-12 text-base"
      />

      {/* 유형 필터 칩 */}
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              "rounded-full px-3 py-1 text-xs font-semibold " +
              (f === filter
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground")
            }
          >
            {f}
          </button>
        ))}
      </div>

      {showCatalog && (
        <p className="px-1 text-xs font-medium text-muted-foreground">추천</p>
      )}
      {!showCatalog && loading && (
        <p className="px-1 text-sm text-muted-foreground">검색 중…</p>
      )}
      {!showCatalog && !loading && results !== null && results.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">
          검색 결과가 없습니다. 종목명이나 티커를 확인해 주세요.
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.symbol}>
            <button
              type="button"
              onClick={() => onSelect({ symbol: item.symbol, name: item.name })}
              className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition active:scale-[0.99] hover:bg-secondary"
            >
              <SymbolAvatar name={item.name} />
              <span className="flex flex-col">
                <span className="font-bold">{item.name}</span>
                <span className="text-sm text-muted-foreground">
                  {item.symbol}
                  {item.exchange ? ` · ${item.exchange}` : ""}
                  {item.ter != null &&
                    ` · 총보수 ${(item.ter * 100).toFixed(2)}%`}
                </span>
              </span>
              {item.assetType && (
                <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {item.assetType}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {/* 시세 없는 자산(부동산·실물·대체)은 검색 안 됨 → 직접 추가(수기 평가).
          거래 플로우는 인라인 폼(onManualAsset), 그 외엔 링크(manualAssetHref).
          둘 다 없으면 숨김(예: 온보딩 — 설립은 단순하게). */}
      {onManualAsset ? (
        <button
          type="button"
          onClick={onManualAsset}
          className="mt-1 flex w-full items-center justify-between rounded-xl border border-dashed border-border px-4 py-3 text-left text-sm text-muted-foreground"
        >
          <span>+ 직접 추가 (부동산·실물·대체자산)</span>
          <span className="text-xs">수기 평가 ›</span>
        </button>
      ) : (
        manualAssetHref && (
          <Link
            href={manualAssetHref}
            className="mt-1 flex items-center justify-between rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
          >
            <span>+ 직접 추가 (부동산·실물·대체자산)</span>
            <span className="text-xs">수기 평가 ›</span>
          </Link>
        )
      )}
    </div>
  );
}
