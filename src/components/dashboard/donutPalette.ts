/**
 * 자산배분 도넛 색 팔레트 — 서버/클라 공용.
 * 도넛 슬라이스(클라 Donut)와 범례 스와치(서버 페이지)가 같은 인덱스로 색을 맞춘다.
 * "use client" 가 아니어야 서버 컴포넌트(allocation·cash)에서도 호출 가능.
 */

/**
 * 토널 팔레트(§거의 무채색 + 포인트 1색) — 토스블루 1색 + 쿨그레이 명도 단계.
 * 무지개 채도 대신 파랑·회색 톤으로 구분(globals.css --chart-* 와 동일 계열).
 * 구분은 색이 아니라 명도 + 범례·라벨이 보조. 마지막은 현금/기타용 옅은 회색.
 */
export const DONUT_PALETTE = [
  "#3182f6", // 토스블루(포인트)
  "#6aa6f9", // 밝은 블루
  "#4e5968", // 잉크 그레이
  "#8b95a1", // 쿨그레이
  "#a9c7fb", // 옅은 블루
  "#b0b8c1", // 라이트 그레이
  "#cdd3d9", // 옅은 회색
  "#e5e8eb", // 현금/기타
];

export function donutColor(i: number): string {
  return DONUT_PALETTE[i % DONUT_PALETTE.length];
}
