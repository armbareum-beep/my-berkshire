"use client";

import { useState, useRef } from "react";
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
  onDone: () => void;
}

export function FileUploadPanel({ holdingId, accounts, onDone }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [brokerage, setBrokerage] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function deleteRow(i: number) {
    setRows((prev) => prev?.filter((_, idx) => idx !== i) ?? null);
  }

  function updateSymbol(i: number, symbol: string) {
    setRows((prev) =>
      prev?.map((r, idx) => (idx === i ? { ...r, symbol: symbol.trim() || null } : r)) ?? null,
    );
  }

  async function handleConfirm() {
    if (!rows) return;
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
      setDone(true);
      setTimeout(onDone, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <CheckCircle2 size={36} className="text-primary" />
        <p className="text-sm font-semibold">임포트 완료!</p>
      </div>
    );
  }

  // 미리보기 단계
  if (rows) {
    const unmapped = rows.filter((r) => !r.symbol).length;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">{rows.length}건 파싱됨</p>
          {unmapped > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
              <AlertCircle size={11} />
              심볼 미확인 {unmapped}건
            </span>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-3 py-2 text-left">날짜</th>
                <th className="px-3 py-2 text-left">유형</th>
                <th className="px-3 py-2 text-left">종목</th>
                <th className="px-3 py-2 text-left">심볼</th>
                <th className="px-3 py-2 text-right">수량</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 tabular-nums">{r.date.slice(2)}</td>
                  <td className="px-3 py-2 font-medium" style={{ color: r.type === "SELL" ? "rgb(239,68,68)" : r.type === "DIVIDEND" ? "rgb(22,163,74)" : undefined }}>
                    {r.type === "BUY" ? "매수" : r.type === "SELL" ? "매도" : "배당"}
                  </td>
                  <td className="px-3 py-2 max-w-[80px] truncate">{r.symbolName}</td>
                  <td className="px-3 py-2">
                    {r.symbol ? (
                      <span className="font-mono text-primary">{r.symbol}</span>
                    ) : (
                      <input
                        type="text"
                        placeholder="코드"
                        onBlur={(e) => updateSymbol(i, e.target.value)}
                        className="w-16 rounded border border-destructive bg-transparent px-1 py-0.5 text-xs font-mono text-destructive focus:outline-none"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.quantity?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => deleteRow(i)} className="text-muted-foreground">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {accounts.length > 1 && (
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}

        {error && (
          <p className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle size={13} /> {error}
          </p>
        )}

        <button
          onClick={handleConfirm}
          disabled={loading || !rows.length}
          className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {loading ? "저장 중..." : `${rows.filter((r) => r.symbol).length}건 임포트`}
        </button>
      </div>
    );
  }

  // 업로드 단계
  return (
    <div className="flex flex-col gap-4">
      <BrokerageGuide selected={brokerage} onSelect={setBrokerage} />

      <div
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-6 transition hover:border-primary"
      >
        {loading ? (
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        ) : (
          <>
            <Upload size={24} className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">파일 드래그 또는 탭해서 선택</p>
            <p className="text-xs text-muted-foreground">.xls · .xlsx · .csv</p>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xls,.xlsx,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle size={13} /> {error}
        </p>
      )}
    </div>
  );
}
