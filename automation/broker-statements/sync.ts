/**
 * 받아둔 명세서를 장부(family_vault)와 대조하고, 빠진 것만 고친다.
 *
 *   npx tsx automation/broker-statements/sync.ts --since 2026-09-18          (보고만)
 *   npx tsx automation/broker-statements/sync.ts --since 2026-09-18 --apply  (고쳐 넣기)
 *
 * 기본은 보고만 한다. --apply 를 줘야 장부를 건드리고, 그때도 먼저 백업을 남긴다.
 * 이미 들어 있고 맞는 항목은 손대지 않는다(헌장 V — 이중 계상 금지).
 */
import { createClient } from "@supabase/supabase-js";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { decryptStatement, detectBroker } from "./decrypt";
import { parseKb, parseKiwoom, type ParsedStatement } from "./parse";
import {
  matchAccount,
  reconcileFlows,
  reconcileCash,
  reconcileHoldings,
  monthlyIncome,
  formatIncome,
  normalizeName,
  type Diff,
  type VaultAccount,
  type VaultFlow,
  type VaultHolding,
} from "./reconcile";
import { loadEnvLocal } from "./env";

interface Vault {
  owners?: { id: string; name: string }[];
  accounts: VaultAccount[];
  holdings: VaultHolding[];
  flows: VaultFlow[];
  products: Record<string, { name?: string }>;
  [key: string]: unknown;
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // 어느 쪽이 없는지 집어 준다. 둘 다 이름만 나열하면 어디를 고쳐야 할지 알 수 없다.
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !key && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `${missing.join(", ")} 가(이) 비어 있습니다.\n` +
        (url ? "  NEXT_PUBLIC_SUPABASE_URL: 있음\n" : "") +
        (key ? "  SUPABASE_SERVICE_ROLE_KEY: 있음\n" : "") +
        "\nGitHub Actions 면 저장소 Settings → Secrets and variables → Actions 에서,\n" +
        "로컬이면 .env.local 에 넣어 주세요.\n" +
        "SUPABASE_SERVICE_ROLE_KEY 는 Supabase 대시보드 → Project Settings → API 의\n" +
        "service_role 키입니다(공개 anon 키가 아닙니다).",
    );
  }
  return createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function findStatements(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const broker of await readdir(root).catch(() => [])) {
    const brokerDir = path.join(root, broker);
    for (const day of await readdir(brokerDir).catch(() => [])) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      for (const name of await readdir(path.join(brokerDir, day)).catch(() => [])) {
        if (name.toLowerCase().endsWith(".html")) out.push(path.join(brokerDir, day, name));
      }
    }
  }
  return out.sort();
}

/** 장부의 products 는 코드→이름이다. 명세서는 이름만 주므로 거꾸로 찾는다. */
function nameToCode(vault: Vault): (name: string) => string | undefined {
  const index = new Map<string, string>();
  for (const [code, product] of Object.entries(vault.products ?? {})) {
    if (product?.name) index.set(normalizeName(product.name), code);
  }
  return (name: string) => index.get(normalizeName(name));
}

async function main() {
  loadEnvLocal();
  const root = path.resolve(
    arg("dir") ?? path.join("automation", "broker-statements", "downloads"),
  );
  const since = arg("since") ?? "";
  const apply = flag("apply");

  const raw = process.env.STATEMENT_PASSWORDS ?? "";
  const passwords = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!passwords.length) throw new Error("STATEMENT_PASSWORDS 가 비어 있습니다.");

  const files = await findStatements(root);
  if (!files.length) throw new Error(`${root} 아래에 명세서가 없습니다. 먼저 fetch 를 돌려 주세요.`);

  const db = database();
  const { data: row, error } = await db
    .from("family_vault")
    .select("data,revision")
    .eq("id", "family")
    .single();
  if (error) throw new Error(`장부를 읽지 못했습니다: ${error.message}`);
  const vault = row.data as Vault;
  const codeOf = nameToCode(vault);
  // 장부 계좌는 주인을 id(P01…)로 들고 있다. 명세서는 이름으로 밝히므로 풀어 둔다.
  const ownerName = new Map((vault.owners ?? []).map((o) => [o.id, o.name]));
  const accounts: VaultAccount[] = vault.accounts.map((a) => ({
    ...a,
    ownerName: a.owner ? ownerName.get(a.owner) : undefined,
  }));

  console.log(`명세서 ${files.length}건 · 장부 계좌 ${accounts.length}개\n`);

  const allDiffs: Diff[] = [];
  const unmatched: string[] = [];
  const income: {
    account: string;
    label: string;
    dividend: Record<string, number>;
    interest: Record<string, number>;
  }[] = [];
  let read = 0;

  for (const file of files) {
    let statement: ParsedStatement;
    try {
      const { rows } = await decryptStatement(file, passwords);
      const broker = detectBroker(rows);
      if (!broker) continue;
      statement = broker === "KB증권" ? parseKb(rows) : parseKiwoom(rows);
    } catch (e) {
      console.log(`읽기 실패 ${path.basename(file)} — ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (since && statement.periodTo < since) continue;
    read += 1;

    const match = matchAccount(statement, accounts, vault.holdings, codeOf);
    const who = `${statement.accountName}${statement.accountLabel ? " " + statement.accountLabel : ""}`;
    if (!match) {
      unmatched.push(`${who} (${statement.accountNo}) ${statement.periodFrom}~${statement.periodTo}`);
      continue;
    }
    const diffs = [
      ...reconcileFlows(statement, match.account.id, vault.flows),
      ...reconcileCash(statement, match.account),
      ...reconcileHoldings(statement, match.account, vault.holdings, codeOf),
    ];
    allDiffs.push(...diffs);
    const m = monthlyIncome(statement);
    if (Object.keys(m.dividend).length || Object.keys(m.interest).length) {
      income.push({ account: match.account.id, label: who, ...m });
    }
    console.log(
      `${diffs.length ? "⚠ " : "  "}${who} → ${match.account.id} (${match.reason})` +
        ` · ${statement.periodFrom}~${statement.periodTo}` +
        (diffs.length ? ` · 다른 항목 ${diffs.length}건` : " · 일치"),
    );
    for (const d of diffs) console.log(`      ${d.message}`);
  }

  console.log(`\n읽은 명세서 ${read}건 · 다른 항목 ${allDiffs.length}건`);
  if (unmatched.length) {
    console.log(`\n장부 계좌를 못 찾은 명세서 ${unmatched.length}건:`);
    for (const u of unmatched) console.log(`  ${u}`);
    console.log("  (보유 종목이 겹치지 않거나 후보가 둘 이상이면 짝짓지 않습니다)");
  }

  if (income.length) {
    console.log("\n명세서가 말하는 그 달의 배당·이자:");
    for (const i of income) {
      console.log(
        `  ${i.label} (${i.account}) 배당 ${formatIncome(i.dividend)} · 이자 ${formatIncome(i.interest)}`,
      );
    }
    console.log("  장부는 계좌별 누적만 들고 있어 월별 대조는 못 합니다. 눈으로 확인해 주세요.");
  }

  // 자동으로 넣는 것은 "빠진 원화 현금흐름"뿐이다. 외화(currency-unsupported)와
  // 금액·수량이 다른 항목은 사람이 판단할 일이라 보고만 한다.
  const fixable = allDiffs.filter((d) => d.kind === "flow-missing");
  const foreign = allDiffs.filter((d) => d.kind === "currency-unsupported");
  if (foreign.length) {
    console.log(`\n외화라 자동으로 넣지 않은 항목 ${foreign.length}건 — 환율은 직접 적용해 주세요:`);
    for (const d of foreign) console.log(`  ${d.message}`);
  }
  if (!fixable.length) {
    console.log("\n자동으로 고칠 것이 없습니다.");
    return;
  }
  console.log(`\n자동으로 넣을 수 있는 항목 ${fixable.length}건 (빠진 현금흐름)`);
  if (!apply) {
    console.log("--apply 를 붙이면 장부에 넣습니다. 지금은 보고만 했습니다.");
    return;
  }

  // 고치기 전에 반드시 백업을 남긴다.
  const { error: backupError } = await db.from("family_vault_backups").insert({
    vault_id: "family",
    data: vault,
    revision: row.revision,
    source_updated_at: new Date().toISOString(),
  });
  if (backupError) throw new Error(`백업에 실패해 중단합니다: ${backupError.message}`);
  console.log("백업을 남겼습니다.");

  const next = { ...vault, flows: [...vault.flows] };
  for (const d of fixable) {
    next.flows.push({
      id: `${d.account}-${randomUUID()}`,
      account: d.account,
      date: d.label.split(" ")[0],
      amount: d.expected as number,
    });
  }
  const revision = randomUUID();
  const { data: saved, error: writeError } = await db
    .from("family_vault")
    .update({ data: next, revision, updated_at: new Date().toISOString() })
    .eq("id", "family")
    .eq("revision", row.revision)
    .select("revision");
  if (writeError) throw new Error(`장부를 고치지 못했습니다: ${writeError.message}`);
  if (!saved?.length) {
    throw new Error("그사이 장부가 바뀌었습니다. 다시 돌려 주세요(덮어쓰지 않았습니다).");
  }
  console.log(`장부에 ${fixable.length}건을 넣었습니다.`);

  const report = path.join(root, "sync-report.json");
  await writeFile(report, JSON.stringify({ diffs: allDiffs, applied: fixable, income }, null, 2));
  console.log(`보고서: ${report}`);
}

main().catch((error) => {
  console.error("실패:", error instanceof Error ? error.message : error);
  process.exit(1);
});
