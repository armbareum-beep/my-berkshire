/**
 * .env.local 읽기·쓰기. 자격증명은 이 파일에만 두고 저장소에는 올리지 않는다
 * (.gitignore 의 .env* 로 제외됨).
 */
import { readFile, writeFile, chmod, access } from "node:fs/promises";
import path from "node:path";

export const ENV_FILE = ".env.local";

/**
 * 기존 내용을 보존하면서 주어진 키만 갈아끼운다.
 * 다른 줄(주석·빈 줄·남의 변수)은 순서까지 그대로 남긴다.
 */
export function mergeEnv(existing: string, entries: Record<string, string>): string {
  const keys = Object.keys(entries);
  const lines = existing ? existing.split(/\r?\n/) : [];
  const kept = lines.filter((line) => {
    const key = line.split("=")[0]?.trim();
    return !key || !keys.includes(key);
  });
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  for (const key of keys) kept.push(`${key}=${entries[key]}`);
  kept.push("");
  return kept.join("\n");
}

/** 환경변수에 없는 값만 .env.local 에서 채운다. 셸에서 준 값이 우선이다. */
export function loadEnvLocal(): void {
  try {
    process.loadEnvFile(path.resolve(ENV_FILE));
  } catch {
    // 파일이 없거나 읽을 수 없으면 그대로 둔다. 쓰는 쪽에서 누락을 안내한다.
  }
}

/** 소유자만 읽도록 저장한다. */
export async function saveEnv(entries: Record<string, string>): Promise<string> {
  const file = path.resolve(ENV_FILE);
  let existing = "";
  try {
    await access(file);
    existing = await readFile(file, "utf8");
  } catch {
    existing = "";
  }
  await writeFile(file, mergeEnv(existing, entries), { mode: 0o600 });
  await chmod(file, 0o600);
  return file;
}
