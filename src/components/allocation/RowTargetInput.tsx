"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { pct } from "@/lib/format";
import { PercentPad } from "@/components/ui/PercentPad";
import {
  setTargetWithinGroup,
  type GroupPick,
  type GroupScope,
} from "@/app/allocate/actions";

/**
 * 종목 한 줄의 목표비중 입력 — **이 화면의 묶음 안에서** 몇 %인가.
 *
 * 검색형 편집기를 걷어내면서(*"새로운거 말고 기존꺼만 리밸런싱"*) **개별 종목 목표를 정할
 * 곳이 하나도 안 남았다.** 묶음(유형·국가·통화) 조절만으로는 "삼성전자를 8%로" 같은 조정을
 * 할 수 없다 — 기존 것을 리밸런싱하려면 종목 줄에서 바로 고쳐져야 한다.
 *
 * ## 기준은 **줄이 서 있는 묶음**이다
 *
 * 예전엔 여기만 "증권 전체 대비"였다. 그래서 주식 안으로 들어가면 목록 비중은 주식
 * 기준(합 100%)인데 목표만 증권 기준(합 48%)이라 숫자가 안 맞았다 — 사용자 지적:
 * *"아직도 종목 내에서 100%가 아니잖아."*
 *
 * 드릴다운은 **지금 보는 계층이 곧 분모**라는 규칙 위에 서 있다(`AllocationLevel` 머리말).
 * 목표만 그 밖에 있을 이유가 없다. 이제 넣는 값도 보이는 값도 이 화면의 100% 기준이고,
 * 저장할 때 `setTargetWithinGroup` 이 묶음 예산을 곱해 평면 절대값으로 되돌린다.
 *
 * ## 묶음 합은 안 움직인다
 *
 * 늘어난 몫은 **같은 묶음의 다른 종목**에서 온다. 그래야 화면 합이 계속 100% 다. 상위
 * 축(유형·국가)도 따라 움직이지 않으므로 축 고정과 같은 성질이고, 합이 안 변하니
 * 100% 초과가 아예 불가능하다.
 *
 * 예전엔 늘어난 몫을 현금에서 가져왔는데, 그러면 한 종목을 올릴 때마다 그 묶음의 합이
 * 커져 화면의 100% 가 깨졌다.
 */
export function RowTargetInput({
  pick,
  label,
  target,
  scope,
  hint,
}: {
  /** 이 줄이 가리키는 것 — 종목 하나이거나 그 안의 묶음(주식 안의 "미국"). */
  pick: GroupPick;
  label: string;
  /** **이 묶음 안에서의** 목표 0~1. */
  target: number;
  /** 어느 묶음 안인가 — 서버가 구성원을 다시 세울 때 쓴다. */
  scope: GroupScope;
  /** 키패드 시트 안에 띄울 보조 문구(지금 비중 등). */
  hint?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function save(next: number) {
    start(async () => {
      const res = await setTargetWithinGroup(pick, next, scope);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // 한 종목을 고치면 같은 묶음의 나머지가 함께 움직인다 — 조용히 넘어가면
      // 손대지 않은 줄이 왜 바뀌었는지 알 수 없다.
      toast.success(
        next === 0
          ? `${label} 목표를 지웠어요 — 나머지가 그 몫을 나눠 가져요`
          : `${label} ${pct(next)} — 같은 묶음 안에서 나눴어요`,
      );
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
