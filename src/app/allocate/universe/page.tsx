import { redirect } from "next/navigation";

/**
 * 후보 관리는 `/allocate/settings` 로 흡수됐다(`docs/allocate-redesign-v1.md` Phase 4).
 * 배분을 바꾸는 값들이 세 화면에 흩어져 있던 게 "직관적이지 않다"의 원인이었다.
 * 사용자가 저장해둔 링크가 죽지 않게 리다이렉트만 남긴다.
 */
export default function UniverseRedirectPage() {
  redirect("/allocate/settings");
}
