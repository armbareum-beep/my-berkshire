"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { BrokerageGuide } from "./BrokerageGuide";
import type { ParsedRow } from "@/app/api/import/parse/route";

interface Account {
  id: string;
  name: string;
}

interface Props {
  holdingId: string;
  accounts: Account[];
}

type Step = "guide" | "upload" | "preview" | "done";

export function ImportWizard({ holdingId, accounts }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("guide");
  const [brokerage, setBrokerage] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import/parse", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "파싱 실패");
      if (!json.rows?.length) throw new Error("파싱된 거래가 없습니다.");
      setRows(json.rows as ParsedRow[]);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function deleteRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateSymbol(i: number, symbol: string) {
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, symbol: symbol.trim() || null } : r)),
    );
  }

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, accountId, holdingId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "저장 실패");
      setStep("done");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const unmappedCount = rows.filter((r) => !r.symbol).length;

  if (step === "done") {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <CheckCircle2 size={48} className="text-primary" />
        <p className="text-lg font-bold">거래내역 임포트 완료!</p>
        <p className="text-sm text-muted-foreground">대시보드로 이동 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 단계 인디케이터 */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {(["guide", "upload", "preview"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <span>›</span>}
            <span
              className="font-medium"
              style={{ color: step === s ? "var(--primary)" : undefined }}
            >
              {s === "guide" ? "① 증권사 선택" : s === "upload" ? "② 파일 업로드" : "③ 확인"}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: 증권사 선택 */}
      {(step === "guide" || step === "upload") && (
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <BrokerageGuide selected={brokerage} onSelect={setBrokerage} />
        </div>
      )}

      {/* Step 1 → 2 버튼 */}
      {step === "guide" && (
        <button
          onClick={() => setStep("upload")}
          disabled={!brokerage}
          className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          다음 — 파일 업로드
        </button>
      )}

      {/* Step 2: 파일 업로드 */}
      {step === "upload" && (
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <p className="mb-3 text-sm font-semibold">거래내역 파일 업로드</p>
          <p className="mb-4 text-xs text-muted-foreground">Excel(.xls, .xlsx) 또는 CSV 파일</p>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border p-8 transition hover:border-primary"
          >
            {loading ? (
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <>
                <Upload size={32} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">파일을 여기에 드래그하거나 탭해서 선택</p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx,.csv"
            className="hidden"
            onChange={handleInputChange}
          />

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
        </div>
      )}

      {/* Step 3: 미리보기 */}
      {step === "preview" && (
        <>
          <div className="rounded-2xl bg-card shadow-card">
            <div className="flex items-center justify-between p-5 pb-3">
              <p className="text-sm font-semibold">파싱 결과 — {rows.length}건</p>
              {unmappedCount > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                  <AlertCircle size={12} />
                  심볼 미확인 {unmappedCount}건
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-4 py-2 text-left">날짜</th>
                    <th className="px-4 py-2 text-left">유형</th>
                    <th className="px-4 py-2 text-left">종목명</th>
                    <th className="px-4 py-2 text-left">심볼</th>
                    <th className="px-4 py-2 text-right">수량</th>
                    <th className="px-4 py-2 text-right">단가</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 tabular-nums">{r.date}</td>
                      <td className="px-4 py-2">
                        <span
                          className="rounded px-1.5 py-0.5 font-medium"
                          style={{
                            background:
                              r.type === "BUY"
                                ? "var(--accent)"
                                : r.type === "SELL"
                                  ? "rgba(239,68,68,0.1)"
                                  : "rgba(34,197,94,0.1)",
                            color:
                              r.type === "BUY"
                                ? "var(--accent-foreground)"
                                : r.type === "SELL"
                                  ? "rgb(239,68,68)"
                                  : "rgb(22,163,74)",
                          }}
                        >
                          {r.type === "BUY" ? "매수" : r.type === "SELL" ? "매도" : "배당"}
                        </span>
                      </td>
                      <td className="px-4 py-2 max-w-[120px] truncate">{r.symbolName}</td>
                      <td className="px-4 py-2">
                        {r.symbol ? (
                          <span className="font-mono text-primary">{r.symbol}</span>
                        ) : (
                          <input
                            type="text"
                            placeholder="코드 입력"
                            defaultValue=""
                            onBlur={(e) => updateSymbol(i, e.target.value)}
                            className="w-20 rounded border border-destructive bg-transparent px-1 py-0.5 text-xs font-mono text-destructive placeholder:text-destructive/50 focus:outline-none"
                          />
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.quantity?.toLocaleString() ?? "-"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.price.toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <button onClick={() => deleteRow(i)} className="text-muted-foreground active:text-destructive">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 계좌 선택 */}
          {accounts.length > 1 && (
            <div className="rounded-2xl bg-card p-5 shadow-card">
              <p className="mb-2 text-sm font-semibold">임포트할 계좌</p>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={loading || rows.length === 0}
            className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {loading ? "저장 중..." : `${rows.filter((r) => r.symbol).length}건 임포트 확인`}
          </button>

          {unmappedCount > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              심볼 미확인 {unmappedCount}건은 임포트에서 제외됩니다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
