/**
 * "어디에 넣을까요" — **돈을 받을 묶음**을 만든다.
 *
 * ## 왜 유형만으로는 부족했나
 *
 * 처음엔 묶음이 `주식` / `ETF·기타` 둘뿐이었다. 그건 묶음이라기보다 **정렬 기준의 경계**였다 —
 * 주식은 기대수익률로, ETF 는 목표 미달로 줄 세우기 때문에 한 줄로 못 세운 것뿐이다.
 *
 * 그런데 사람이 실제로 하는 질문은 그것만이 아니다. *"이번 달엔 미국에 넣자"* 는 유형이
 * 아니라 **국가** 질문이다. 1단계에서 국가별 비중을 보고서도 배분은 유형으로만 고를 수
 * 있으면, 본 것과 할 수 있는 것이 어긋난다.
 *
 * 그래서 묶는 축을 렌즈로 넓혔다 — 유형 / 국가(아래 `BUCKET_LENSES`). 저장되는 값은 여전히
 * 종목 목표 하나뿐이고(`lib/targetLens.ts`), 여기서 만드는 묶음도 **그때그때 묶어 보는 것**이다.
 *
 * ## 정렬 기준은 묶음 안에서 다시 갈린다
 *
 * "미국"을 고르면 미국 주식과 미국 ETF 가 함께 들어온다. 둘에 이어진 번호를 매기면
 * 비교 가능한 척이 되므로(`lib/allocateRanking.ts`), 묶음 **안을 두 섹션으로 나누고
 * 각각 1번부터** 센다. 유형 렌즈에서는 한쪽이 늘 비어 자연히 한 섹션만 남는다.
 *
 * ## 순서 — 모자란 곳이 먼저
 *
 * 묶음 순서는 **목표 미달 합** 내림차순이다. "어디에 넣을까"에 대한 답이 목록 순서와
 * 같아야 고르는 일이 쉬워진다. 태그가 없어 모인 묶음(기타·미분류)은 구성이 유동적이라
 * 맨 아래로 내린다.
 */
import { groupRanked, targetGap, type RankedRow } from "./allocateRanking";
import { isUntaggedLabel } from "./targetLens";
import type { TagKey } from "./allocation";

/** 묶는 축. 목표비중 렌즈(`targetLens`)와 같은 키를 쓴다. */
export type BucketLens = TagKey;

/**
 * 화면에 세우는 축.
 *
 * 산업은 뺐다 — 사용자 지적: *"ETF는 산업별이 다 미분류로 되어 있으니까."* 산업 태그는
 * 공시에서 **개별 기업만** 채워지므로 ETF 비중이 큰 사람에겐 "미분류" 한 덩어리가 된다.
 * `buildBuckets` 자체는 여전히 `sector` 를 받는다(테스트도 있다) — 태그가 채워지는 날
 * 여기 한 줄과 `loadAllocateData({withSectors:true})` 를 같이 되돌리면 켜진다.
 */
export const BUCKET_LENSES: { key: BucketLens; label: string }[] = [
  { key: "assetType", label: "유형" },
  { key: "country", label: "국가" },
];

export interface BucketSection {
  key: "stocks" | "others";
  /** 이 섹션이 무슨 기준으로 줄 서 있는지. 번호 옆에 밝힌다. */
  basis: string;
  note: string | null;
  rows: RankedRow[];
}

export interface AllocateBucket {
  /** 렌즈 안에서 유일한 키(= 라벨). */
  key: string;
  label: string;
  /** 돈이 갈 수 있는 종목 — `PlanOptions.eligible` 판정에 그대로 쓴다. */
  members: string[];
  /** 정렬 기준이 다른 섹션들. 빈 섹션은 빠진다. */
  sections: BucketSection[];
  /** 미리보기용 대표 종목 — 살 수 있는 것 중 첫째, 없으면 그냥 첫째. */
  top: RankedRow | null;
  count: number;
  /** 목표까지 모자란 합(%p, 소수). 음수면 이미 넘긴 묶음. */
  gap: number;
  /** 태그가 없어 모인 묶음인가(기타·미분류). */
  isUntagged: boolean;
}

const SECTION_META = {
  stocks: { basis: "기대수익률 순", note: null },
  others: {
    basis: "목표 미달 순",
    note: "기대수익률 모형을 쓸 수 없어 목표비중으로만 판단해요",
  },
} as const;

/** 이 종목이 이 렌즈에서 어느 묶음에 속하는가. */
function tagOf(r: RankedRow, lens: BucketLens): string {
  if (lens === "country") return r.row.country;
  if (lens === "sector") return r.row.sector;
  return r.row.assetType;
}

/**
 * 순위가 매겨진 목록을 한 렌즈로 묶는다.
 *
 * 입력 순서(= `rankRows` 의 전역 순위)를 섹션 안에서 보존한다 — `groupRanked` 가 ETF
 * 쪽만 자기 기준으로 다시 세운다.
 */
export function buildBuckets(
  ranked: RankedRow[],
  lens: BucketLens,
): AllocateBucket[] {
  const byLabel = new Map<string, RankedRow[]>();
  for (const r of ranked) {
    const label = tagOf(r, lens);
    const list = byLabel.get(label) ?? [];
    list.push(r);
    byLabel.set(label, list);
  }

  return [...byLabel.entries()]
    .map(([label, rows]) => {
      const { stocks, others } = groupRanked(rows);
      const sections: BucketSection[] = (
        [
          { key: "stocks" as const, rows: stocks },
          { key: "others" as const, rows: others },
        ] satisfies { key: BucketSection["key"]; rows: RankedRow[] }[]
      )
        .filter((s) => s.rows.length > 0)
        .map((s) => ({ ...s, ...SECTION_META[s.key] }));

      const ordered = sections.flatMap((s) => s.rows);
      return {
        key: label,
        label,
        members: ordered.map((r) => r.row.key),
        sections,
        top:
          ordered.find(
            (r) => r.leg.status === "BUY" || r.leg.status === "STRETCH",
          ) ??
          ordered[0] ??
          null,
        count: ordered.length,
        gap: ordered.reduce((s, r) => s + Math.max(0, targetGap(r)), 0),
        isUntagged: isUntaggedLabel(label),
      };
    })
    .sort((a, b) => {
      if (a.isUntagged !== b.isUntagged) return a.isUntagged ? 1 : -1;
      return (
        b.gap - a.gap || b.count - a.count || a.label.localeCompare(b.label)
      );
    });
}

/**
 * 이 축의 **짝** — 유형으로 묶었으면 안은 국가로, 국가로 묶었으면 안은 유형으로.
 *
 * 축이 둘뿐이라 짝이 하나로 정해진다. 셋 이상이 되면 사용자가 고르게 해야 한다.
 */
export function subLensOf(lens: BucketLens): BucketLens {
  return lens === "assetType" ? "country" : "assetType";
}

/**
 * 한 묶음 **안**을 다른 축으로 다시 묶는다 — "주식 안의 미국".
 *
 * ## 왜 필요한가
 *
 * 3단계는 축 하나로만 골랐다. 그래서 *"주식만"* 도 *"미국만"* 도 되는데 **"미국 주식만"**
 * 은 안 됐다. 비중조절은 `주식 → 국가별 → 미국` 으로 들어갈 수 있는데 배분은 못 하니
 * 본 것과 할 수 있는 것이 어긋난다 — 사용자 지적: *"비중조절은 들어가서 볼 수 있는데
 * 그게 안 되는 거잖아?"*
 *
 * 새로 세는 건 없다. 묶음의 구성원만 걸러 같은 `buildBuckets` 를 다시 돌린다 — 규칙을
 * 두 벌 두면 겉묶음과 속묶음의 순서·섹션 기준이 갈린다.
 *
 * 결과가 하나뿐이면 **좁힐 게 없다**(주식이 전부 미국이면 "미국 주식" = "주식"). 그때는
 * 화면이 이 목록을 아예 안 보여준다.
 */
export function buildSubBuckets(
  ranked: RankedRow[],
  bucket: AllocateBucket,
  lens: BucketLens,
): AllocateBucket[] {
  const inside = new Set(bucket.members);
  return buildBuckets(
    ranked.filter((r) => inside.has(r.row.key)),
    lens,
  );
}
