export async function measureServer<T>(
  label: string,
  task: () => Promise<T>,
): Promise<T> {
  const enabled =
    process.env.NODE_ENV === "development" || process.env.PERF_LOG === "1";
  if (!enabled) return task();

  const startedAt = performance.now();
  try {
    return await task();
  } finally {
    const elapsed = Math.round(performance.now() - startedAt);
    console.info(`[PERF] ${label}=${elapsed}ms`);
  }
}
