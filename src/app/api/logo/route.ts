import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { externalLogoSources } from "@/lib/finance/assetImage";

/**
 * 온디맨드 로고 프록시 — 종목 심볼을 받아 외부 소스(토스 CDN·FMP)에서 로고를 **서버에서**
 * 받아 우리 도메인으로 서빙한다. 같은 출처라 사용자 광고차단에 안 막히고(핵심), 핫링크가
 * 아니며, 미보유·검색 종목도 sync 없이 로고가 뜬다. CDN 캐시(immutable)로 재요청은 엣지에서.
 *
 * 미발견 시 404 → 클라이언트(Avatar)가 글자 동그라미로 폴백(깨진 이미지 0).
 */

/** FMP가 국내 ETF 등에 주는 동일 generic placeholder(md5) — 로고로 취급하지 않는다. */
const FMP_PLACEHOLDER_MD5 = "c8eeb10a353dd6faceabaa55106a4fd7";

/** 웜 인스턴스 내 메모리 캐시(엣지/CDN 캐시 보조). null = 미발견 캐싱. */
const mem = new Map<string, { body: ArrayBuffer; type: string } | null>();

async function fetchImage(
  url: string,
): Promise<{ body: ArrayBuffer; type: string } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image")) return null;
    const body = await res.arrayBuffer();
    if (body.byteLength < 200) return null; // 빈/깨진 이미지
    if (createHash("md5").update(Buffer.from(body)).digest("hex") === FMP_PLACEHOLDER_MD5)
      return null;
    return { body, type };
  } catch {
    return null;
  }
}

function image(hit: { body: ArrayBuffer; type: string }): Response {
  return new Response(hit.body, {
    headers: {
      "Content-Type": hit.type,
      // 1년 immutable — 브라우저·Vercel CDN 모두 캐시(재요청은 엣지에서).
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim() ?? "";
  if (!symbol) return new Response(null, { status: 400 });

  if (mem.has(symbol)) {
    const hit = mem.get(symbol)!;
    return hit ? image(hit) : new Response(null, { status: 404 });
  }

  let found: { body: ArrayBuffer; type: string } | null = null;
  for (const url of externalLogoSources(symbol)) {
    found = await fetchImage(url);
    if (found) break;
  }
  mem.set(symbol, found);

  if (!found)
    // 미발견은 하루만 캐시 — 나중에 소스가 생기면 다시 시도.
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  return image(found);
}
