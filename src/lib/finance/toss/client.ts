/**
 * 토스증권 Open API 클라이언트 — 서버 전용.
 *
 * - OAuth2 client_credentials(form-urlencoded) 토큰을 모듈 메모리에 캐시(유효 ~24h).
 * - tossFetch: GET 시세 호출. 실패 시 throw → 호출부가 야후 폴백.
 * 자격증명: .env.local TOSS_API_CLIENT_ID / TOSS_API_CLIENT_SECRET / TOSS_API_BASE_URL.
 */

interface TossCreds {
  base: string;
  id: string;
  secret: string;
}

function creds(): TossCreds {
  const base = process.env.TOSS_API_BASE_URL;
  const id = process.env.TOSS_API_CLIENT_ID;
  const secret = process.env.TOSS_API_CLIENT_SECRET;
  if (!base || !id || !secret) {
    throw new Error("TOSS_API_BASE_URL / TOSS_API_CLIENT_ID / TOSS_API_CLIENT_SECRET required in .env.local");
  }
  return { base, id, secret };
}

let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

async function issueToken(): Promise<string> {
  const { base, id, secret } = creds();
  const res = await fetch(`${base}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Toss token HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (typeof json.access_token !== "string") throw new Error("Toss token missing in response");
  const ttlSec = typeof json.expires_in === "number" ? json.expires_in : 86400;
  cached = { token: json.access_token, expiresAt: Date.now() + ttlSec * 1000 };
  return json.access_token;
}

/** 유효 토큰 반환(캐시 재사용, 만료 60초 전 갱신). 동시 호출은 단일 발급으로 합류. */
export async function tossToken(): Promise<string> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  if (!inflight) {
    inflight = issueToken().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export interface TossPricesResponse {
  result?: { symbol: string; lastPrice: string; currency: string; timestamp?: string }[];
}

export interface TossRateResponse {
  result?: { rate: string; midRate?: string; baseCurrency: string; quoteCurrency: string };
}

export interface TossCandlesResponse {
  result?: {
    candles?: {
      timestamp: string;
      openPrice: string;
      highPrice: string;
      lowPrice: string;
      closePrice: string;
      volume?: string;
      currency: string;
    }[];
  };
}

/** 토스 GET 호출. params 는 쿼리스트링. 실패 시 throw. */
export async function tossFetch<T>(
  path: string,
  opts: { params: Record<string, string>; revalidate?: number },
): Promise<T> {
  const { base } = creds();
  const token = await tossToken();
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(opts.params)) url.searchParams.set(k, v);
  const fetchOpts: RequestInit =
    opts.revalidate === 0
      ? { cache: "no-store" }
      : { next: { revalidate: opts.revalidate ?? 10 } };
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    ...fetchOpts,
  });
  if (!res.ok) throw new Error(`Toss ${path} HTTP ${res.status}`);
  return (await res.json()) as T;
}
