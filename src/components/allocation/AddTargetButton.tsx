"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { TargetSearchModal } from "@/components/allocate/TargetSearchModal";

/**
 * `+ 종목 추가` — 계층 안에서 바로 목표비중을 매긴다.
 *
 * 예전엔 이게 `/allocation/targets` 라는 **별도 화면**이었다. 그래서 메뉴가 셋이 됐다 —
 * 자본배분(돈 넣기) / 지금 비중(조회) / 비중 설정(편집). 사용자 지적:
 * *"너무 복잡한데... 검색해서 하니까 부자연스럽고 계층으로 못 나누니까 여기서 비중설정하는게
 * 의미없어 보여."*
 *
 * 맞다. **보는 곳에서 바로 정해야** 순서가 자연스럽다. 그래서 화면을 없애고 버튼으로 접었다 —
 * 지금 보고 있는 계층에 종목을 더하는 동작이 된다.
 *
 * 검색 모달 자체는 그대로 재사용한다. 아직 한 주도 없는 기업은 목록에 없으니 찾는 수밖에
 * 없고(`TargetSearchModal` 주석), 저장 한 번이 후보 승격 + 목표비중을 같이 처리한다.
 */
export function AddTargetButton({
  currentTargets,
  suggestions,
  label = "종목 추가",
}: {
  currentTargets: Record<string, number>;
  suggestions: { symbol: string; name: string }[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-3.5 text-sm font-semibold text-muted-foreground transition active:scale-[0.99]"
      >
        <Plus size={16} aria-hidden />
        {label}
      </button>
      {open && (
        <TargetSearchModal
          currentTargets={currentTargets}
          suggestions={suggestions}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
