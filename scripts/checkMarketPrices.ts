/** 기존 앱과 동일한 현재가·원화 환산 경로를 점검한다. 계좌/DB 접근 없음. */
import { loadEnvConfig } from "@next/env";
import { getKrwPrices } from "../src/lib/finance/prices";
import { financeSource } from "../src/lib/finance/source";

loadEnvConfig(process.cwd());

async function main() {
  const symbols = [...new Set(process.argv.slice(2).flatMap((arg) => arg.split(","))
    .map((s) => s.trim()).filter(Boolean))];
  if (!symbols.length) {
    console.error("Usage: npm run check:prices -- 069500 AAPL");
    process.exitCode = 1;
    return;
  }
  const result = await getKrwPrices(symbols);
  const missingSymbols = symbols.filter((symbol) => result.prices[symbol] == null);
  console.log(JSON.stringify({
    configuredSource: financeSource(),
    // 조회 완료 시각이며 공급자 시세의 체결 시각이나 실시간 보장을 뜻하지 않는다.
    checkedAt: new Date().toISOString(),
    ...result,
    missingSymbols,
  }, null, 2));
  if (missingSymbols.length) process.exitCode = 1;
}

main().catch(() => {
  console.error("시세 점검 실패: 데이터 소스 설정 및 네트워크 연결을 확인하세요.");
  process.exitCode = 1;
});
