import { createClient } from "@/lib/supabase/server";
import { backfillSectors, type SecurityRecord } from "@/lib/securities";
import { UNKNOWN_SECTOR } from "@/lib/finance/sector";
import { aggregate } from "@/components/etf/EtfChartStreamed";
import {
  EtfDonutChart,
  type ChartDatasets,
  type ChartSlice,
} from "@/components/etf/EtfDonutChart";

interface StockSliceInput {
  symbol: string;
  name: string;
  /** 개별주(비ETF) 슬리브 내 비중(0~1). */
  stockWeight: number;
  countryTag?: string;
}

/**
 * 개별주(비ETF) 배분 도넛 — ETF 차트와 동일 UI(EtfDonutChart), 데이터만 종목 기준.
 * 종목/지역/자산은 이미 로드된 메타로 동기 계산, 섹터는 securities.sector +
 * 미적재분 backfill(DART/EDGAR — allocation 페이지와 동일 경로)이라 스트리밍.
 */
export async function StockChartStreamed({
  supabase,
  slices,
  meta,
  embedded,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  slices: StockSliceInput[];
  meta: Record<string, SecurityRecord>;
  embedded?: boolean;
}) {
  const stockShare: ChartSlice[] = slices.map((s) => ({
    name: s.name,
    weight: s.stockWeight,
  }));

  const region = aggregate(
    slices.map((s) => ({
      key: s.countryTag ?? meta[s.symbol]?.country ?? "기타",
      weight: s.stockWeight,
    })),
  );

  const assetType = aggregate(
    slices.map((s) => ({
      key: meta[s.symbol]?.assetType ?? "주식",
      weight: s.stockWeight,
    })),
  );

  // 섹터: 저장분 우선, 미적재 종목만 공시 API로 채움(멱등·재시도는 다음 방문).
  const stockMeta = Object.fromEntries(
    slices.flatMap((s) => (meta[s.symbol] ? [[s.symbol, meta[s.symbol]]] : [])),
  );
  const filled = await backfillSectors(supabase, stockMeta);
  const sector = aggregate(
    slices.map((s) => {
      const m = meta[s.symbol];
      // 코인·원자재는 섹터 개념이 없어 자산유형으로 분류(sector.ts 방침).
      const key =
        m?.sector ??
        filled[s.symbol] ??
        (m && m.assetType !== "주식" ? m.assetType : UNKNOWN_SECTOR);
      return { key, weight: s.stockWeight };
    }),
  );

  const datasets: ChartDatasets = {
    etfShare: stockShare,
    sector,
    region,
    assetType,
  };

  return (
    <EtfDonutChart datasets={datasets} shareLabel="종목" embedded={embedded} />
  );
}
