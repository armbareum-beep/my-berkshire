"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteAccount } from "@/app/accounts/actions";

export function DeleteAccountButton({ accountId, name }: { accountId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteAccount(accountId);
      if (!res.ok) {
        setError(res.error);
        setConfirming(false);
      }
    });
  }

  if (confirming) {
    return (
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="flex items-center gap-1">
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
        {error && <span className="text-xs text-destructive">{error}</span>}
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
