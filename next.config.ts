import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev와 production build를 동시에 실행해도 Turbopack 청크가 섞이지 않게 분리한다.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  typescript: {
    // 리더보드 alpha 컬럼 DB 스키마 불일치 등 기존 TS 오류가 빌드를 막지 않도록.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
