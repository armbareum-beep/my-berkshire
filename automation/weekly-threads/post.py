"""rational.cap 주간 글: "2026년 1월 1일 1000만 원을 넣었다면?"

매주 토요일 아침 GitHub Actions에서 실행한다.
- 지수·환율·금: 네이버 금융 시세
- 물가: 한국은행 ECOS 소비자물가지수
- 내 수익률: Supabase family_vault 일별 평가자료로 TWR, 마지막 일별 자료 이후는 현재 보유수량 × 현재가
숫자를 하나라도 못 가져오거나 값이 이상하면 게시하지 않고 실패로 끝난다.

환경변수: THREADS_ACCESS_TOKEN, SUPABASE_SERVICE_ROLE_KEY, DRY_RUN(1이면 게시하지 않고 출력만)
"""
import datetime as dt
import json
import os
import re
import sys
import urllib.parse
import urllib.request

# ── 2026년 시작값 (2025년 마지막 거래일 종가) ──────────────────────────────
YEAR_START = dt.date(2025, 12, 31)
BASE = {
    "SPX": 6845.50,      # S&P500 2025-12-31
    "NDX": 25249.85,     # 나스닥100 2025-12-31
    "KPI200": 605.98,    # 코스피200 2025-12-30
    "CSI300": 4629.94,   # 2025-12-31
    "HSTECH": 5515.0,    # 항셍테크 2025-12-31
    "USD": 1439.0,       # 서울외환시장 2025년 마지막 종가 (12-30 15:30)
    "JPY": 920.44,       # 100엔, 2025년 마지막 재정환율
    "CNY": 205.85,       # 2025년 마지막 위안·원
    "GOLD": 4341.10,     # COMEX 금 연속물 2025-12-31 (네이버 GCcv1)
}
# 항셍테크 지수는 네이버에 없어 CSOP 항셍테크 ETF(3033.HK)로 따라간다. 2026-10-26 종가로 맞춤.
HSTECH_ANCHOR = (3857.53, 3.778)
DEPOSIT_RATE = 0.0277   # 2026년 1월 신규취급 정기예금 금리 (한국은행)
DIVIDEND = {"SPX": 0.009, "NDX": 0.005, "KPI200": 0.012, "CSI300": 0.025, "HSTECH": 0.007}  # 연 배당률, 경과일만큼 반영

SUPABASE_URL = "https://cfzairdystqguatvcggc.supabase.co"
THREADS_API = "https://graph.threads.net/v1.0"
UA = {"User-Agent": "Mozilla/5.0 rational-cap-weekly"}


def get(url, headers=None):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def num(s):
    return float(str(s).replace(",", ""))


def naver_domestic(codes):
    data = get("https://polling.finance.naver.com/api/realtime/domestic/stock/" + ",".join(codes))["datas"]
    return {x["itemCode"]: num(x["closePrice"]) for x in data}


def naver_world(kind, code):
    data = get(f"https://polling.finance.naver.com/api/realtime/worldstock/{kind}/{urllib.parse.quote(code)}")["datas"]
    if not data:
        raise ValueError(f"시세 없음: {code}")
    return num(data[0]["closePrice"])


def naver_market(category, code):
    return num(get(f"https://m.stock.naver.com/front-api/marketIndex/productDetail?category={category}&reutersCode={code}")["result"]["closePrice"])


def kospi200():
    return num(get("https://polling.finance.naver.com/api/realtime/domestic/index/KPI200")["datas"][0]["closePrice"])


def cpi():
    def rows(start, end):
        url = f"https://ecos.bok.or.kr/api/StatisticSearch/sample/json/kr/1/10/901Y009/M/{start}/{end}/0"
        return get(url)["StatisticSearch"]["row"]
    base = num(rows("202512", "202512")[0]["DATA_VALUE"])
    today = dt.date.today()
    start = (today.replace(day=1) - dt.timedelta(days=300)).strftime("%Y%m")
    latest = rows(start, today.strftime("%Y%m"))[-1]
    return base, num(latest["DATA_VALUE"]), latest["TIME"]


US_TICKERS = {"BRK-B": "BRKb"}


def us_price(sym):
    for code in [US_TICKERS.get(sym, sym), f"{sym}.O", f"{sym}.N", f"{sym}.K"]:
        try:
            return naver_world("stock", code)
        except Exception:
            continue
    raise ValueError(f"미국 종목 시세 없음: {sym}")


def account_group(t):
    t = re.sub(r"\s", "", t)
    if re.search(r"ISA|개인종합자산관리", t, re.I) or re.search(r"IRP|퇴직연금", t, re.I) or "연금" in t:
        return "invest"
    if re.search(r"CMA", t, re.I) or "외화" in t:
        return "cash"
    return "invest"


def portfolio_return(usd):
    rows = get(f"{SUPABASE_URL}/rest/v1/family_vault?id=eq.family&select=data", {
        "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": "Bearer " + os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    })
    p = rows[0]["data"]
    accounts = [a for a in p["accounts"] if account_group(a["type"]) == "invest"]
    if any(not a.get("complete") for a in accounts):
        raise ValueError("입출금 내역이 완전하지 않은 계좌가 있음")
    ids = {a["id"] for a in accounts}
    flows = p["flows"]
    external = [f for f in flows if f["account"] in ids and not (
        f.get("transfer") and any(g["id"] != f["id"] and g.get("transfer") == f["transfer"] and g["account"] in ids for g in flows))]
    flow_on = {}
    for f in external:
        flow_on[f["date"]] = flow_on.get(f["date"], 0) - f["amount"]   # 앱과 같은 부호: 입금은 amount < 0

    hist = p["performance"]
    daily = [d for d in hist["daily"] if d["date"] >= YEAR_START.isoformat()]
    if not daily or daily[0]["date"] != YEAR_START.isoformat():
        raise ValueError("2025-12-31 일별 평가자료 없음")
    values = [sum(d["values"][i] for i in ids) for d in daily]
    growth = 1.0
    for i in range(1, len(values)):
        adjusted = values[i] - flow_on.get(daily[i]["date"], 0)
        if values[i - 1] <= 0 or adjusted < 0:
            raise ValueError("TWR 계산 불가 구간")
        growth *= adjusted / values[i - 1]

    # 마지막 일별 자료 이후: 현재 보유수량 × 현재가
    holdings = [h for h in p["holdings"] if h["account"] in ids and h["quantity"]]
    domestic = sorted({h["code"] for h in holdings if re.fullmatch(r"\d{6}", h["code"])})
    px = naver_domestic(domestic) if domestic else {}
    for h in holdings:
        c = h["code"]
        if c in px:
            continue
        if re.fullmatch(r"[A-Z][A-Z.\-]*", c):
            px[c] = us_price(c) * usd
        else:
            px[c] = p["products"][c]["price"]   # 원금형 예금 등
    now = sum(a.get("cash", 0) for a in accounts) + sum(h["quantity"] * px[h["code"]] for h in holdings)
    last = daily[-1]["date"]
    later = sum(v for d, v in flow_on.items() if d > last)
    growth *= (now - later) / values[-1]
    return growth - 1, p["asOf"]


def main():
    today = dt.date.today()
    days = (today - YEAR_START).days
    usd, jpy, cny = (naver_market("exchange", c) for c in ("FX_USDKRW", "FX_JPYKRW", "FX_CNYKRW"))
    cpi_base, cpi_now, cpi_month = cpi()
    inflation = cpi_now / cpi_base

    div = lambda k: 1 + DIVIDEND[k] * days / 365
    hstech = HSTECH_ANCHOR[0] * naver_world("stock", "3033.HK") / HSTECH_ANCHOR[1]
    rows = [
        [("예금", DEPOSIT_RATE * days / 365)],
        [("S&P500", naver_world("index", ".INX") / BASE["SPX"] * div("SPX") * usd / BASE["USD"] - 1),
         ("나스닥100", naver_world("index", ".NDX") / BASE["NDX"] * div("NDX") * usd / BASE["USD"] - 1),
         ("KOSPI200", kospi200() / BASE["KPI200"] * div("KPI200") - 1),
         ("CSI300", naver_world("index", ".CSI300") / BASE["CSI300"] * div("CSI300") * cny / BASE["CNY"] - 1),
         ("항셍테크", hstech / BASE["HSTECH"] * div("HSTECH") * usd / BASE["USD"] - 1)],
        [("달러", usd / BASE["USD"] - 1),
         ("엔화", jpy / BASE["JPY"] - 1)],
        [("금", naver_market("metals", "GCcv1") / BASE["GOLD"] * usd / BASE["USD"] - 1)],
    ]
    mine, as_of = portfolio_return(usd)

    for group in rows:
        for name, r in group:
            if not -0.9 < r < 3:
                raise ValueError(f"값 확인 필요: {name} {r}")
    if not -0.9 < mine < 3 or not 0.95 < inflation < 1.2:
        raise ValueError(f"값 확인 필요: 내 수익률 {mine}, 물가 {inflation}")

    def line(name, r):
        real = (1 + r) / inflation - 1
        return f"{name}　{r * 100:.1f}% → 실질 {real * 100:.1f}% → {round(1000 * (1 + r) / inflation)}만 원"

    blocks = ["\n".join(line(n, r) for n, r in g) for g in rows]
    mine_line = line("rational.cap", mine)
    head = "rational.cap　"
    text = "\n\n".join(["2026년 1월 1일 1000만 원을 넣었다면?", *blocks, mine_line,
                        f"같은 기간 물가 {(inflation - 1) * 100:.1f}%\n원화 기준 · 배당·이자 포함 · 세전 · 금액은 물가 반영"])
    start = text.index(mine_line) + len(head)
    u16 = lambda s: len(s.encode("utf-16-le")) // 2
    entities = [{"entity_type": "SPOILER", "offset": u16(text[:start]), "length": u16(mine_line[len(head):])}]

    print(text)
    print(f"\n[물가 {cpi_month} 기준 · 앱 보유자료 {as_of} 기준 · {len(text)}자]")
    if len(text) > 500:
        raise ValueError("Threads 글자 수 500자 초과")
    if os.environ.get("DRY_RUN") == "1":
        return

    token = os.environ["THREADS_ACCESS_TOKEN"]
    body = urllib.parse.urlencode({"media_type": "TEXT", "text": text,
                                   "text_entities": json.dumps(entities), "access_token": token}).encode()
    container = json.loads(urllib.request.urlopen(urllib.request.Request(f"{THREADS_API}/me/threads", data=body), timeout=30).read())
    pub = urllib.parse.urlencode({"creation_id": container["id"], "access_token": token}).encode()
    result = json.loads(urllib.request.urlopen(urllib.request.Request(f"{THREADS_API}/me/threads_publish", data=pub), timeout=30).read())
    print("게시 완료:", result.get("id"))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("게시하지 않음:", e, file=sys.stderr)
        sys.exit(1)
