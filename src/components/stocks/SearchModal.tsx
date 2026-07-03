"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { searchSymbols, type SymbolSearchResult } from "@/lib/finance/search";
import { toggleWatch } from "@/app/stocks/watchlistActions";
import { PRESET_QUOTES, fxCodeFromSymbol } from "@/lib/finance/quotes";
import { pct } from "@/lib/format";
import { useMounted } from "@/components/ui/useMounted";

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
  const mounted = useMounted();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [watched, setWatched] = useState<Set<string>>(new Set(initialWatched));
  const [dirty, setDirty] = useState(false);

  function close() {
    if (dirty) router.refresh();
    onClose();
  }

  // 열려있는 동안 body 스크롤 락 + ESC 닫기(BottomSheet와 동일 패턴).
  // 배경 스크롤 가능한 풀스크린이었던 기존 동작을 락으로 정정.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

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

  if (!mounted) return null;

  return createPortal(
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
          className="touch-target shrink-0 px-2 text-sm font-medium text-muted-foreground"
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
                    <span className="inline-flex items-center gap-1">
                      {on ? <Star size={12} fill="currentColor" /> : <Plus size={12} />}
                      {p.name}
                    </span>
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
                    const fxCode = fxCodeFromSymbol(item.symbol);
                    const preset = PRESET_QUOTES.find((p) => p.symbol === item.symbol);
                    const href = fxCode
                      ? `/fx/${fxCode}`
                      : preset?.isIndex
                        ? `/index/${encodeURIComponent(item.symbol)}`
                        : `/stocks/${item.symbol}?name=${encodeURIComponent(item.name)}${
                            item.assetType ? `&assetType=${encodeURIComponent(item.assetType)}` : ""
                          }`;
                    router.push(href, { scroll: false });
                    // 검색 모달을 닫아야 인터셉트된 상세 시트가 가려지지 않는다(US2).
                    onClose();
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
                  className="touch-target shrink-0 px-2 leading-none"
                  style={{ color: on ? "var(--primary)" : "var(--muted-foreground)" }}
                >
                  <Star size={22} fill={on ? "currentColor" : "none"} strokeWidth={1.75} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
