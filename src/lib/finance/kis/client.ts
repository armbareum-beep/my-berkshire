/**
 * 한국투자증권(KIS) Open API 클라이언트 — 서버 전용.
 *
 * - OAuth2 client_credentials 토큰을 모듈 메모리에 캐시(유효 ~24h, 발급 1회/분 제한이라 재사용 필수).
 * - kisFetch: GET 시세 호출(주문 아님 → hashkey 불필요). 실패 시 throw → 호출부가 야후 폴백.
 * 자격증명: .env.local KIS_APP_KEY / KIS_APP_SECRET / KIS_BASE_URL(실전 권장, 시장데이터).
 */

interface KisCreds {
  base: string;
  key: string;
  secret: string;
}

function creds(): KisCreds {
  const base = process.env.KIS_BASE_URL;
  const key = process.env.KIS_APP_KEY;
  const secret = process.env.KIS_APP_SECRET;
  if (!base || !key || !secret) {
    throw new Error("KIS_BASE_URL / KIS_APP_KEY / KIS_APP_SECRET required in .env.local");
  }
  return { base, key, secret };
}

let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

async function issueToken(): Promise<string> {
  const { base, key, secret } = creds();
  const res = await fetch(`${base}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: key, appsecret: secret }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KIS token HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (typeof json.access_token !== "string") throw new Error("KIS token missing in response");
  const ttlSec = typeof json.expires_in === "number" ? json.expires_in : 86400;
  cached = { token: json.access_token, expiresAt: Date.now() + ttlSec * 1000 };
  return json.access_token;
}

/** 유효 토큰 반환(캐시 재사용, 만료 60초 전 갱신). 동시 호출은 단일 발급으로 합류. */
export async function kisToken(): Promise<string> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  if (!inflight) {
    inflight = issueToken().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export interface KisQuoteResponse {
  rt_cd?: string;
  msg1?: string;
  output?: Record<string, string>;
}

export interface KisChartResponse {
  rt_cd?: string;
  output1?: Record<string, string>;
  output2?: Record<string, string>[];
}

/** KIS GET 호출. trId 는 헤더 tr_id. params 는 쿼리스트링. 실패 시 throw. */
export async function kisFetch<T>(
  path: string,
  opts: { trId: string; params: Record<string, string>; revalidate?: number },
): Promise<T> {
  const { base, key, secret } = creds();
  const token = await kisToken();
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(opts.params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: key,
      appsecret: secret,
      tr_id: opts.trId,
      custtype: "P",
    },
    next: { revalidate: opts.revalidate ?? 60 },
  });
  if (!res.ok) throw new Error(`KIS ${opts.trId} HTTP ${res.status}`);
  return (await res.json()) as T;
}
