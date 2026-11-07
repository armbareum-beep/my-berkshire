/**
 * 증권사 보안메일(YettieSoft VestMail) 첨부를 열어 표 내용을 꺼낸다.
 *
 * KB·키움 모두 월간거래내역을 암호화된 HTML 로 보낸다. 본문은 브라우저 안에서
 * JavaScript 로만 풀리므로 헤드리스 브라우저가 필요하다. 네트워크는 쓰지 않는다
 * (복호화는 전부 로컬) — 그래서 페이지의 바깥 요청은 전부 막는다.
 *
 * 비밀번호는 개인(주민등록번호 앞 6자리)·법인(사업자번호 10자리)이다. 파일마다
 * 주인이 다르므로 후보를 차례로 시도한다. 비밀번호는 로그에 찍지 않는다.
 */
import { chromium, type Browser } from "playwright";
import path from "node:path";

export interface DecryptResult {
  /** leaf 표의 행들. 중첩 표 때문에 같은 행이 겹쳐 나오지 않도록 걸러낸 것. */
  rows: string[][];
  /** 어떤 후보로 열렸는지 — 계좌 주인을 가려내는 데 쓴다. 값 자체는 기록하지 않는다. */
  passwordIndex: number;
}

const WRONG_PASSWORD = /잘못|invalid|wrong/i;

/** 열린 문서에서 leaf 표의 셀을 뽑아낸다. 브라우저 안에서 도는 코드다. */
const EXTRACT = `(() => {
  const out = [];
  for (const table of document.querySelectorAll('table')) {
    if (table.querySelector('table')) continue;
    for (const tr of table.querySelectorAll('tr')) {
      const cells = [...tr.querySelectorAll('td,th')]
        .map((td) => (td.innerText || '').replace(/\\s+/g, ' ').trim());
      if (cells.some((c) => c)) out.push(cells);
    }
  }
  return out;
})()`;

async function tryPassword(
  browser: Browser,
  filePath: string,
  password: string,
): Promise<string[][] | null> {
  const context = await browser.newContext();
  try {
    // 이 문서는 외부에서 온 신뢰할 수 없는 자료다. 바깥으로 아무것도 내보내지 못하게 막는다.
    await context.route("**", (route) =>
      route.request().url().startsWith("file://") ? route.continue() : route.abort(),
    );
    const page = await context.newPage();
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss().catch(() => {});
    });

    await page.goto("file://" + path.resolve(filePath), { waitUntil: "load" });
    if (!(await page.locator("#password").count())) {
      // 암호가 걸려 있지 않은 문서. 그대로 읽는다.
      return (await page.evaluate(EXTRACT)) as string[][];
    }
    await page.fill("#password", password);
    await page.evaluate(() => {
      const w = window as unknown as { doAction?: () => void };
      if (typeof w.doAction === "function") w.doAction();
    });
    await page.waitForTimeout(5000);

    if (dialogs.some((m) => WRONG_PASSWORD.test(m))) return null;

    let best: string[][] = [];
    for (const frame of page.frames()) {
      try {
        const rows = (await frame.evaluate(EXTRACT)) as string[][];
        if (rows.length > best.length) best = rows;
      } catch {
        // 접근할 수 없는 프레임은 건너뛴다.
      }
    }
    return best.length > 3 ? best : null;
  } finally {
    await context.close();
  }
}

/**
 * 후보 비밀번호를 차례로 시도해 문서를 연다. 전부 실패하면 오류를 낸다 —
 * 조용히 빈 결과를 돌려주면 "거래 0건"으로 잘못 반영될 수 있다.
 */
export async function decryptStatement(
  filePath: string,
  passwords: string[],
): Promise<DecryptResult> {
  if (!passwords.length) throw new Error("보안메일 비밀번호 후보가 비어 있습니다.");
  // 보통은 Playwright 가 받아둔 브라우저를 쓴다. 다른 곳에 깔려 있으면
  // PLAYWRIGHT_CHROMIUM_PATH 로 알려줄 수 있다.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
  let browser: Browser;
  try {
    browser = await chromium.launch(executablePath ? { executablePath } : {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Executable doesn't exist|install/i.test(message)) {
      throw new Error(
        "보안메일을 열 브라우저가 없습니다. 아래를 한 번만 돌려 주세요:\n\n" +
          "  npx playwright install chromium\n\n" +
          `(원래 오류: ${message.split("\n")[0]})`,
      );
    }
    throw error;
  }
  try {
    for (let i = 0; i < passwords.length; i++) {
      const rows = await tryPassword(browser, filePath, passwords[i]);
      if (rows) return { rows, passwordIndex: i };
    }
  } finally {
    await browser.close();
  }
  throw new Error(
    `보안메일을 열지 못했습니다: ${path.basename(filePath)}\n` +
      `후보 비밀번호 ${passwords.length}개가 모두 거부됐습니다. ` +
      `개인은 주민등록번호 앞 6자리, 법인은 사업자번호 10자리입니다.`,
  );
}

/** 행 내용으로 어느 증권사 양식인지 가린다. */
export function detectBroker(rows: string[][]): "KB증권" | "키움증권" | null {
  // 구역 제목(유가증권잔고현황 등)은 양식 개편에 약하다. 계좌 머리말의 항목 이름이
  // 두 증권사에서 서로 다르고 반드시 있으므로 그걸로 가린다.
  const flat = rows.map((r) => r.join(" ")).join("\n");
  const kb = /작성기준일/.test(flat) && /거래기간/.test(flat);
  const kiwoom = /잔고기준일/.test(flat) && /대상기간/.test(flat);
  if (kb && !kiwoom) return "KB증권";
  if (kiwoom && !kb) return "키움증권";
  return null;
}
