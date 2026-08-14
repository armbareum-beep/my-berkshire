"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PercentPad } from "@/components/ui/PercentPad";
import { setTargetWeight } from "@/app/allocate/actions";

/**
 * 종목 한 줄의 목표비중 입력.
 *
 * 검색형 편집기를 걷어내면서(*"새로운거 말고 기존꺼만 리밸런싱"*) **개별 종목 목표를 정할
 * 곳이 하나도 안 남았다.** 묶음(유형·국가·통화) 조절만으로는 "삼성전자를 8%로" 같은 조정을
 * 할 수 없다 — 기존 것을 리밸런싱하려면 종목 줄에서 바로 고쳐져야 한다.
 *
 * 기준은 **투자자산 대비**다. 같은 줄에 표시되는 목표와 같은 기준이라야 넣은 값이 그대로
 * 보인다(줄의 `현재 %`는 이 계층 안 기준이라 다르다 — 화면 각주가 그 둘을 구분해 말한다).
 *
 * ## 여기엔 축 고정을 걸지 않는다
 *
 * 묶음을 밀 때는 다른 축이 안 움직이게 상계한다(`scaleGroupLocked`). 종목 하나는 그렇게
 * 하지 않는다 — "META 를 36% 로" 라고 했는데 손대지 않은 NVDA 가 몰래 줄면 그게 더
 * 놀랍기 때문이다. 그래서 종목을 올리면 그만큼 **현금에서** 온다(합이 100% 를 넘으면
 * 막힌다). 화면 각주가 그 사실을 말한다.
 */
export function RowTargetInput({
  symbol,
  label,
  target,
  hint,
}: {
  symbol: string;
  label: string;
  /** 투자자산 대비 목표 0~1. */
  target: number;
  /** 키패드 시트 안에 띄울 보조 문구(지금 비중 등). */
  hint?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function save(next: number) {
    start(async () => {
      const res = await setTargetWeight(symbol, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (next === 0) toast.success(`${label} 목표비중을 지웠어요`);
      router.refresh();
    });
  }

  return (
    <PercentPad
      value={target}
      label={label}
      hint={hint}
      disabled={pending}
      onCommit={save}
    />
  );
}
