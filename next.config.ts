import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev와 production build를 동시에 실행해도 Turbopack 청크가 섞이지 않게 분리한다.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
