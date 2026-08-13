"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { useMounted } from "@/components/ui/useMounted";
import { searchSymbols, type SymbolSearchResult } from "@/lib/finance/search";
import { setTargetFromSearch } from "@/app/allocate/actions";
import { pct } from "@/lib/format";

/**
 * 목표비중 — **검색형 설정**.
 *
 * 리스트를 훑어 칸을 채우는 방식은 보유 종목이 늘수록 무너진다. 아직 한 주도 없는 기업은
 * 리스트에 아예 없어서 **먼저 후보로 넣고 다시 와야** 했다. 그래서 반대로 뒤집는다 —
 * **찾아서 정한다.**
 *
 * 저장 한 번이 "후보 승격 + 목표비중"을 같이 처리한다(`setTargetFromSearch`).
 * 비중을 정한다는 건 사겠다는 뜻이라, 후보 지정을 따로 시키면 "비중을 넣었는데 왜 배분이
 * 안 되지?"가 된다.
 *
 * 검색어가 비어 있을 땐 **보유 종목**을 먼저 깔아둔다. 대부분의 목표비중은 이미 들고 있는
 * 기업에 매기므로, 그걸 다시 타이핑하게 만드는 건 검색형의 대가가 아니라 그냥 불편이다.
 *
 * 검색·디바운스·모달 골격은 `components/stocks/SearchModal.tsx` 와 같은 패턴이다.
 */
export function TargetSearchModal({
  currentTargets,
  suggestions,
  onClose,
}: {
  /** symbol → 현재 목표비중(0~1). 결과 행에 "이미 정해둔 값"을 보여주려고 받는다. */
  currentTargets: Record<string, number>;
  /** 검색 전에 깔아둘 목록 — 보유 종목(평가액 큰 순). */
  suggestions: { symbol: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  function close() {
    if (dirty) router.refresh();
    onClose();
  }

  // 열려있는 동안 body 스크롤 락 + ESC 닫기.
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
    // 빈 검색어일 때 결과를 비우지 않는다 — effect 안에서 setState 하지 않으려고,
    // 대신 렌더에서 걸러낸다(아래 `visible`).
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

  // 검색어를 지우면 이전 결과가 남지 않게 렌더 시점에 거른다.
  const visible = q.trim() === "" ? [] : results;

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <Search size={16} className="shrink-0 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="기업 이름이나 티커로 찾기"
          className="h-10 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
        <button
          type="button"
          onClick={close}
          aria-label="닫기"
          className="shrink-0 rounded-full p-1.5 text-muted-foreground"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {q.trim() === "" ? (
          suggestions.length > 0 ? (
            <>
              <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                보유 종목
              </p>
              <ul className="flex flex-col gap-0.5">
                {suggestions.map((item) => (
                  <ResultRow
                    key={item.symbol}
                    symbol={item.symbol}
                    name={item.name}
                    current={currentTargets[item.symbol] ?? 0}
                    onSaved={() => setDirty(true)}
                  />
                ))}
              </ul>
              <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted-foreground">
                아직 한 주도 없는 기업은 위에서 검색해 넣으세요.
              </p>
            </>
          ) : (
            <p className="py-10 text-center text-sm leading-relaxed text-muted-foreground">
              찾아서 목표비중을 정하세요.
              <br />
              아직 한 주도 없는 기업도 넣을 수 있어요.
            </p>
          )
        ) : loading && visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">찾는 중…</p>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            결과가 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visible.map((item) => (
              <ResultRow
                key={item.symbol}
                symbol={item.symbol}
                name={item.name}
                current={currentTargets[item.symbol] ?? 0}
                onSaved={() => setDirty(true)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * 한 줄 — 그 자리에서 목표비중을 넣는다. 화면을 옮기지 않는다.
 * 검색 결과와 보유 목록이 같은 행을 쓴다(둘의 동작이 갈리면 사용자가 헷갈린다).
 */
function ResultRow({
  symbol,
  name,
  current,
  onSaved,
}: {
  symbol: string;
  name: string;
  current: number;
  onSaved: () => void;
}) {
  const [raw, setRaw] = useState(current > 0 ? String(+(current * 100).toFixed(2)) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(current);

  async function save() {
    const v = raw.trim();
    const next = v === "" ? 0 : Number(v);
    if (!Number.isFinite(next) || next < 0 || next > 100) {
      toast.error("0~100 사이의 숫자를 넣어주세요.");
      setRaw(saved > 0 ? String(+(saved * 100).toFixed(2)) : "");
      return;
    }
    if (Math.abs(next / 100 - saved) < 1e-9) return;

    setSaving(true);
    const res = await setTargetFromSearch(symbol, name, next / 100);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setSaved(next / 100);
    onSaved();
    toast.success(
      next > 0
        ? `${name} 목표 ${pct(next / 100)} — 배분 대상이 됐어요`
        : `${name} 목표비중을 지웠어요`,
    );
  }

  return (
    <li className="flex items-center gap-3 rounded-xl px-1 py-2">
      <SymbolAvatar symbol={symbol} name={name} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {symbol}
          {saved > 0 && ` · 목표 ${pct(saved)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          value={raw}
          disabled={saving}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="0"
          aria-label={`${name} 목표비중 (%)`}
          className="h-9 w-20 text-right tabular-nums"
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
    </li>
  );
}
