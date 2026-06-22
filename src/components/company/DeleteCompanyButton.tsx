"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteCompany } from "@/app/company/actions";

export function DeleteCompanyButton({ holdingId, name }: { holdingId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteCompany(holdingId);
    });
  }

  if (confirming) {
    return (
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          {pending ? "삭제 중…" : "확인"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground"
        >
          취소
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label={`${name} 삭제`}
      className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground transition hover:text-destructive"
    >
      <Trash2 size={13} strokeWidth={1.75} />
    </button>
  );
}
