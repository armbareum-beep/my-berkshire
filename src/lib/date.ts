/** 오늘 날짜(KST) 를 YYYY-MM-DD 로. 서버 UTC 와 무관하게 한국 기준 '오늘'. */
export function todayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
