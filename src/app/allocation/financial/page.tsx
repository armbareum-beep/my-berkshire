import { redirect } from "next/navigation";

/** 투자자산 계층은 `/allocation` 루트로 올라갔다(계층 하나를 줄였다). */
export default function FinancialRedirect() {
  redirect("/allocation");
}
