# Routing Contract: `@sheet` 병렬 슬롯 & 인터셉터

루트 `app/layout.tsx`에 단일 병렬 슬롯 `@sheet`를 추가하고, 조회형 라우트를 `(.)`로 가로챈다.

## 루트 레이아웃 변경

```tsx
// src/app/layout.tsx
export default function RootLayout({
  children,
  sheet,            // @sheet 슬롯
}: { children: React.ReactNode; sheet: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full font-sans antialiased">
      <body className="min-h-dvh">
        <div className="mx-auto min-h-dvh w-full max-w-[480px] bg-background">
          {children}
        </div>
        {sheet}            {/* 시트는 fixed 오버레이 — 컬럼 위에 뜸 */}
        <MarketAutoRefresh />
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
```

## 필수 파일 계약

| 파일 | 반환 | 이유 |
|---|---|---|
| `app/@sheet/default.tsx` | `null` | **v16 필수**(없으면 빌드 실패). 하드 내비/새로고침 시 시트 없음 → FR-008 |
| `app/@sheet/[...catchAll]/page.tsx` | `null` | 시트 열린 채 비대상(작업형) 라우트로 소프트 내비 시 슬롯 비움 → US3 |
| `app/@sheet/(.){route}/page.tsx` | `<Sheet fullHref="/{route}"><Content/></Sheet>` | 조회형 라우트 인터셉트 |

> 빌드가 `app/default.tsx`(children 슬롯)도 요구하면 추가한다 — 검증 단계에서 `next build`로 확정.

## 인터셉터 대상(조회형)

`(.)stocks/[symbol]`, `(.)index/[symbol]`, `(.)report`, `(.)networth`, `(.)lookthrough`, `(.)disclosures`, `(.)company`, `(.)holdings`, `(.)dividends`, `(.)annual-report`

- 매처는 `(.)` — `@sheet`는 슬롯(세그먼트 아님)이라 대상은 루트 세그먼트 기준 동일 레벨.
- 각 인터셉터 page는 async params를 그대로 받아(`await params`) 대상 Content에 전달.

## 인터셉트 제외(작업형 — 변경 없음)

`/transactions`, `/rebalance`(+`/[tag]`), `/import`, `/accounts`(+`/[id]`) — 인터셉터를 만들지 않으면 `<Link>`가 전체 페이지로 정상 이동.

## 진입 `<Link>` 계약

- 조회형 진입 링크에는 `scroll={false}`를 지정(배경 스크롤 점프 방지 → SC-002).
- "전체 보기"는 `<Link>`가 아니라 **하드 내비게이션**(`<a href>`)이어야 재인터셉트되지 않음(FR-007).

## 하드 내비/딥링크 동작

- `/{route}` 직접 진입·새로고침 → `children`=전체 page, `@sheet`=`default`(null) → 전체 페이지(FR-008).
