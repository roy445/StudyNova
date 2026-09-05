import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 每週小考可能一次上傳多頁 PDF／圖片；避免 Next proxy 直接回應 413。
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
