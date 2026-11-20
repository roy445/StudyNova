import type { NextConfig } from "next";

const securityHeaders = [
  // 1. 防點擊劫持 (Clickjacking)
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  // 2. 防 MIME-sniffing 嗅探攻擊
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  // 3. 跨站腳本保護 (XSS Filter)
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  // 4. Referrer 策略保護隱私
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // 5. 限制瀏覽器敏感權限存取 (Permissions-Policy)
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // 6. 強制 HTTPS (HSTS)
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
  // 每週小考可能一次上傳多頁 PDF／圖片；避免 Next proxy 直接回應 413。
  outputFileTracingIncludes: {
    "/*": ["./src/server/fonts/**/*"],
  },
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
