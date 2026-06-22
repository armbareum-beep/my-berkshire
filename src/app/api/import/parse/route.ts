import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";

export interface ParsedRow {
  date: string;
  type: "BUY" | "SELL" | "DIVIDEND";
  symbolName: string;
  symbol: string | null;
  quantity: number | null;
  price: number;
  fee: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const PARSE_PROMPT = `당신은 한국 증권사 거래내역 파일을 파싱하는 전문가입니다.
아래 스프레드시트 행 데이터에서 거래 내역을 추출하세요.

다음 JSON 배열 형식으로 반환하세요:
[
  {
    "date": "YYYY-MM-DD",
    "type": "BUY" | "SELL" | "DIVIDEND",
    "symbolName": "종목명(파일 그대로)",
    "symbol": "종목코드 또는 null",
    "quantity": 수량(숫자 또는 null),
    "price": 단가(KRW 기준 숫자),
    "fee": 수수료+세금 합계(없으면 0)
  }
]

규칙:
- type: 매수/매수체결 → BUY, 매도/매도체결 → SELL, 배당/배당금 → DIVIDEND
- symbol: 한국주식은 6자리 숫자(예: 삼성전자→"005930", SK하이닉스→"000660", 카카오→"035720"), 미국주식은 티커(예: Apple→"AAPL", Tesla→"TSLA"), 모르면 null
- price: 단가(주당 가격). 총액만 있으면 총액÷수량
- 날짜형식: YYYYMMDD, YYYY.MM.DD, YYYY-MM-DD 모두 → YYYY-MM-DD로 변환
- 헤더행, 합계행, 비거래행은 제외
- JSON만 반환하세요. 설명 없이.

데이터:
`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "파일이 없습니다." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE)
    return Response.json({ error: "파일이 너무 큽니다. (최대 5MB)" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-placeholder"))
    return Response.json({ error: "AI 파싱 기능이 아직 설정되지 않았습니다." }, { status: 503 });

  // xlsx로 파일 파싱
  const buffer = Buffer.from(await file.arrayBuffer());
  let rows: unknown[][];
  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  } catch {
    return Response.json({ error: "파일을 읽을 수 없습니다. Excel 또는 CSV 파일인지 확인해주세요." }, { status: 400 });
  }

  // 빈 행 제거 후 최대 500행
  const nonEmpty = rows.filter((r) => r.some((c) => c !== "")).slice(0, 500);
  if (nonEmpty.length === 0)
    return Response.json({ error: "파일에 데이터가 없습니다." }, { status: 400 });

  // Claude API 호출
  const client = new Anthropic({ apiKey });
  let parsed: ParsedRow[];
  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: PARSE_PROMPT + JSON.stringify(nonEmpty),
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    // JSON 배열 추출 (마크다운 코드블록 처리)
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("JSON 배열을 찾을 수 없습니다.");
    parsed = JSON.parse(match[0]) as ParsedRow[];
  } catch (e) {
    console.error("Claude parse error:", e);
    return Response.json({ error: "AI 파싱 중 오류가 발생했습니다. 다시 시도해주세요." }, { status: 500 });
  }

  // 기본 유효성 검사
  const valid = parsed.filter(
    (r) => r.date && r.type && r.symbolName && typeof r.price === "number" && r.price >= 0,
  );

  return Response.json({ rows: valid });
}
