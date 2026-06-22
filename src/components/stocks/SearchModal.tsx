"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { searchSymbols, type SymbolSearchResult } from "@/lib/finance/search";
import { toggleWatch } from "@/app/stocks/watchlistActions";
import { PRESET_QUOTES } from "@/lib/finance/quotes";
import { pct } from "@/lib/format";

/**
 * 종목 검색 모달 — 관심종목이 이미 메인이므로 검색은 오버레이로.
 * 결과에서 바로 ★(관심 추가)하거나, 행을 누르면 상세(연구 모드)로.
 * 닫을 때 router.refresh 로 관심종목 시세 목록 갱신.
 */
export function SearchModal({
  initialWatched,
  onClose,
}: {
  initialWatched: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [watched, setWatched] = useState<Set<string>>(new Set(initialWatched));
  const [dirty, setDirty] = useState(false);

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

  function close() {
    if (dirty) router.refresh();
    onClose();
  }

  function star(item: SymbolSearchResult) {
    const was = watched.has(item.symbol);
    setWatched((prev) => {
      const next = new Set(prev);
      if (was) next.delete(item.symbol);
      else next.add(item.symbol);
      return next;
    });
    setDirty(true);
    toggleWatch(item.symbol, was, item.name).then((res) => {
      if (!res.ok) {
        toast.error(res.error);
        // 롤백
        setWatched((prev) => {
          const next = new Set(prev);
          if (was) next.add(item.symbol);
          else next.delete(item.symbol);
          return next;
        });
      } else {
        toast.success(was ? "관심종목에서 뺐어요" : "관심종목에 담았어요");
      }
    });
  }

  const hasQuery = q.trim() !== "";
  const visibleResults = hasQuery ? results : [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="종목·코인 검색 (예: 삼성전자, AAPL)"
          className="h-11 flex-1 text-base"
        />
        <button
          type="button"
          onClick={close}
          className="shrink-0 px-2 text-sm font-medium text-muted-foreground"
        >
          닫기
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {!hasQuery && (
          <div className="px-1 py-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              지수·환율 빠른 추가
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESET_QUOTES.map((p) => {
                const on = watched.has(p.symbol);
                return (
                  <button
                    key={p.symbol}
                    type="button"
                    onClick={() =>
                      star({ symbol: p.symbol, name: p.name, exchange: null })
                    }
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      on
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {on ? "★ " : "+ "}
                    {p.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              또는 종목명·티커로 검색하세요.
            </p>
          </div>
        )}
        {hasQuery && loading && (
          <p className="px-1 text-sm text-muted-foreground">검색 중…</p>
        )}
        {!loading && hasQuery && visibleResults.length === 0 && (
          <p className="px-1 text-sm text-muted-foreground">
            결과가 없어요. 티커(005930)나 영문명으로도 시도해보세요.
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {visibleResults.map((item) => {
            const on = watched.has(item.symbol);
            return (
              <li
                key={item.symbol}
                className="flex items-center gap-3 rounded-xl p-3 hover:bg-secondary"
              >
                <button
                  type="button"
                  onClick={() => {
                    const preset = PRESET_QUOTES.find((p) => p.symbol === item.symbol);
                    const href = preset?.isIndex
                      ? `/index/${encodeURIComponent(item.symbol)}`
                      : `/stocks/${item.symbol}?name=${encodeURIComponent(item.name)}${
                          item.assetType ? `&assetType=${encodeURIComponent(item.assetType)}` : ""
                        }`;
                    router.push(href);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <SymbolAvatar name={item.name} symbol={item.symbol} />
                  <span className="flex min-w-0 flex-col">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-bold">{item.name}</span>
                      {item.assetType && (
                        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {item.assetType}
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {item.symbol}
                      {item.exchange ? ` · ${item.exchange}` : ""}
                      {item.ter != null ? ` · TER ${pct(item.ter, 2)}` : ""}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => star(item)}
                  aria-label={on ? "관심 해제" : "관심 추가"}
                  className="shrink-0 px-2 text-2xl leading-none"
                  style={{ color: on ? "var(--primary)" : "var(--muted-foreground)" }}
                >
                  {on ? "★" : "☆"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
