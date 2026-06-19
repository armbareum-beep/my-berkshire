"use client";

import { CATALOG, type CatalogItem } from "@/lib/finance/catalog";
import { Avatar } from "@/components/ui/Avatar";

/**
 * 종목 첫 글자 이니셜 원형 폴백(로고 미저장 — STEP 4에서 시세 API 로고로 교체).
 * 공용 `Avatar` 에 위임. 기본 size=lg(기존 h-10 유지). 신규 코드는 Avatar 직접 사용 가능.
 */
export function SymbolAvatar({
  name,
  symbol,
  size = "lg",
}: {
  name: string;
  /** 색 결정용 종목코드(있으면 브랜드색 정확도↑). */
  symbol?: string;
  size?: "sm" | "md" | "lg";
}) {
  return <Avatar name={name} symbol={symbol} size={size} />;
}

/**
 * 토스증권식 종목 선택 — [원형 로고] 종목명(Bold)/티커(작은 회색) 행.
 * STEP 4에서 실시간 검색으로 교체. 지금은 카탈로그(목업 시세와 일치)에서 고른다.
 */
export function SymbolPicker({
  onSelect,
  items = CATALOG,
  note,
}: {
  onSelect: (item: CatalogItem) => void;
  /** 보여줄 종목 목록(기본=전체 카탈로그). 매각은 보유 종목만 넘긴다. */
  items?: CatalogItem[];
  /** 행 우측 보조 표시(예: 보유수량). */
  note?: (symbol: string) => string;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.symbol}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition active:scale-[0.99] hover:bg-secondary"
          >
            <SymbolAvatar name={item.name} symbol={item.symbol} />
            <span className="flex flex-col">
              <span className="font-bold">{item.name}</span>
              <span className="text-sm text-muted-foreground">{item.symbol}</span>
            </span>
            {note && (
              <span className="ml-auto text-sm font-medium text-muted-foreground tabular-nums">
                {note(item.symbol)}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
