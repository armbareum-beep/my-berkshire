"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Search } from "lucide-react";
import { toggleYearComplete } from "@/app/import/actions";
import { QuickEntryForm, type YearTrade } from "./QuickEntryForm";
import { BrokerageGuide } from "./BrokerageGuide";

interface Account {
  id: string;
  name: string;
}

interface Props {
  holdingId: string;
  years: number[];
  yearCounts: Record<number, number>;
  completedYears: number[];
  accounts: Account[];
  today: string;
  trades: YearTrade[];
}

export function YearProgress({ holdingId, years, yearCounts, completedYears, accounts, today, trades }: Props) {
  const [completed, setCompleted] = useState<Set<number>>(new Set(completedYears));
  const [expanded, setExpanded] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  const [extraYears, setExtraYears] = useState<number[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideBroker, setGuideBroker] = useState<string | null>(null);

  const allYears = [...years, ...extraYears].sort((a, b) => b - a);
  const oldestShown = allYears[allYears.length - 1] ?? years[0];

  function addOneYear() {
    setExtraYears((prev) => [...prev, oldestShown - 1]);
  }

  async function handleToggle(year: number) {
    setToggling(year);
    const isNowComplete = !completed.has(year);
    const next = new Set(completed);
    isNowComplete ? next.add(year) : next.delete(year);
    setCompleted(next);
    await toggleYearComplete(holdingId, year, isNowComplete);
    setToggling(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {allYears.map((year) => {
        const count = yearCounts[year] ?? 0;
        const isDone = completed.has(year);
        const isExpanded = expanded === year;

        return (
          <div key={year} className="rounded-2xl bg-card shadow-card overflow-hidden">
            {/* 연도 행 */}
            <div className="flex items-center gap-3 p-4">
              {/* 완료 체크 버튼 */}
              <button
                onClick={() => handleToggle(year)}
                disabled={toggling === year}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition"
                style={{
                  background: isDone ? "var(--primary)" : "transparent",
                  borderColor: isDone ? "var(--primary)" : "var(--border)",
                }}
              >
                {isDone && <Check size={14} strokeWidth={3} className="text-primary-foreground" />}
              </button>

              {/* 연도 + 건수 */}
              <div className="flex-1">
                <span className="font-bold">{year}년</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {count > 0 ? `${count}건` : "미입력"}
                </span>
              </div>

              {/* 펼치기 버튼 (완료 아닐 때만) */}
              {!isDone && (
                <button
                  onClick={() => setExpanded(isExpanded ? null : year)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition active:opacity-60"
                >
                  {isExpanded ? "닫기" : "입력"}
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              )}
            </div>

            {/* 펼침 패널 — 거래내역 조회 안내 + 직접 입력 폼 */}
            {isExpanded && !isDone && (
              <div className="border-t border-border px-4 pb-4 pt-3">
                {/* 거래내역 어디서 보나요? (접이식) */}
                <button
                  type="button"
                  onClick={() => setGuideOpen((o) => !o)}
                  className="flex w-full items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2.5 text-sm font-semibold transition active:scale-[0.99]"
                >
                  <Search size={15} className="shrink-0 text-primary" />
                  거래내역, 어디서 보나요?
                  <span className="ml-auto text-muted-foreground">
                    {guideOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </button>
                {guideOpen && (
                  <div className="mt-3">
                    <BrokerageGuide selected={guideBroker} onSelect={setGuideBroker} />
                  </div>
                )}

                <div className="mt-3">
                  <QuickEntryForm
                    accounts={accounts}
                    year={year}
                    today={today}
                    trades={trades}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={addOneYear}
        className="rounded-2xl border border-dashed border-border py-3 text-sm text-muted-foreground transition active:opacity-60"
      >
        + {oldestShown - 1}년 추가
      </button>

      <p className="text-center text-xs text-muted-foreground">
        체크박스를 눌러 완료된 연도를 표시하세요
      </p>
    </div>
  );
}
