"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { SymbolAvatar } from "./SymbolPicker";
import { CATALOG, type CatalogItem } from "@/lib/finance/catalog";
import { assetTypeOf } from "@/lib/securities";
import { searchSymbols, type SymbolSearchResult } from "@/lib/finance/search";

/** 자산유형 필터 칩. */
const FILTERS = ["전체", "주식", "ETF", "코인", "원자재"] as const;
type Filter = (typeof FILTERS)[number];

const RECENT_KEY = "symbol-recent-searches";
const MAX_RECENT = 10;
const EMPTY_RECENT: SymbolSearchResult[] = [];

// localStorage를 외부 스토어로 바인딩(useSyncExternalStore) — SSR/첫 렌더는 빈 배열,
// 하이드레이션 후 실제 값. 스냅샷은 raw 문자열 기준 캐시(매 렌더 새 배열 생성 방지).
const recentListeners = new Set<() => void>();
let recentCache = EMPTY_RECENT;
let recentCacheRaw: string | null = null;

function subscribeRecent(cb: () => void): () => void {
  recentListeners.add(cb);
  return () => recentListeners.delete(cb);
}

function getRecentSnapshot(): SymbolSearchResult[] {
  const raw = localStorage.getItem(RECENT_KEY);
  if (raw !== recentCacheRaw) {
    recentCacheRaw = raw;
    try {
      recentCache = raw ? (JSON.parse(raw) as SymbolSearchResult[]) : EMPTY_RECENT;
    } catch {
      recentCache = EMPTY_RECENT;
    }
  }
  return recentCache;
}

function getRecentServerSnapshot(): SymbolSearchResult[] {
  return EMPTY_RECENT;
}

function pushRecent(item: SymbolSearchResult): void {
  const next = [
    item,
    ...getRecentSnapshot().filter((r) => r.symbol !== item.symbol),
  ].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    return; // 저장 불가(프라이빗 모드 등)면 최근 검색 없이 진행
  }
  recentListeners.forEach((cb) => cb());
}

/**
 * 종목 검색 — 토스증권식. 빈 입력이면 최근 검색(없으면 추천), 입력하면 야후 검색(디바운스 300ms).
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
  const recent = useSyncExternalStore(
    subscribeRecent,
    getRecentSnapshot,
    getRecentServerSnapshot,
  );

  useEffect(() => {
    const query = q.trim();
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

  const showRecent = q.trim() === "";
  const typeOf = (it: SymbolSearchResult) => it.assetType ?? "주식";

  const recentFiltered =
    filter === "전체" ? recent : recent.filter((it) => typeOf(it) === filter);

  // 최근 검색이 없으면(신규 사용자·해당 유형 기록 없음) 추천(카탈로그) 폴백.
  // 추천은 짧게 — 전체는 유형별 대표 1개씩(4개), 유형 필터는 그 유형 최대 4개.
  const catalogItems: SymbolSearchResult[] = CATALOG.map((c) => ({
    symbol: c.symbol,
    name: c.name,
    exchange: null,
    assetType: c.assetType ?? assetTypeOf(null, c.symbol),
    ter: c.ter,
  }));
  const recommended: SymbolSearchResult[] =
    filter === "전체"
      ? (["주식", "ETF", "코인", "원자재"] as const)
          .map((t) => catalogItems.find((it) => typeOf(it) === t))
          .filter((x): x is SymbolSearchResult => !!x)
      : catalogItems.filter((it) => typeOf(it) === filter).slice(0, 4);

  const showFallback = showRecent && recentFiltered.length === 0;

  const items: SymbolSearchResult[] = showRecent
    ? showFallback
      ? recommended
      : recentFiltered
    : filter === "전체"
      ? (results ?? [])
      : (results ?? []).filter((it) => typeOf(it) === filter);

  function handleSelect(item: SymbolSearchResult) {
    pushRecent(item);
    onSelect({ symbol: item.symbol, name: item.name });
  }

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

      {showRecent && (
        <p className="px-1 text-xs font-medium text-muted-foreground">
          {showFallback ? "추천" : "최근 검색"}
        </p>
      )}
      {!showRecent && loading && (
        <p className="px-1 text-sm text-muted-foreground">검색 중…</p>
      )}
      {!showRecent && !loading && results !== null && results.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">
          검색 결과가 없습니다. 종목명이나 티커를 확인해 주세요.
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.symbol}>
            <button
              type="button"
              onClick={() => handleSelect(item)}
              className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition active:scale-[0.99] hover:bg-secondary"
            >
              <SymbolAvatar name={item.name} symbol={item.symbol} />
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
