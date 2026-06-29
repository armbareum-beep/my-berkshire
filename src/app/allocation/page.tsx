import { redirect } from "next/navigation";

/** 자산배분 진입 → 유형별 탭(기본)으로 이동. */
export default function AllocationPage() {
  redirect("/allocation/type");
}
