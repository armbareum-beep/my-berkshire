"use client";

import { Printer } from "lucide-react";

export function PrintAnnualReportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
    >
      <Printer size={16} /> PDF로 저장
    </button>
  );
}
