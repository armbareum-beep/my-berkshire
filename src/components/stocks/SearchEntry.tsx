"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { SearchModal } from "./SearchModal";

/** 검색바(탭하면 검색 모달). 관심종목이 메인이라 검색은 오버레이로 띄운다. */
export function SearchEntry({ watched }: { watched: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl bg-secondary px-4 py-3 text-left text-sm text-muted-foreground"
      >
        <Search size={16} />
        종목 검색
      </button>
      {open && (
        <SearchModal initialWatched={watched} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
