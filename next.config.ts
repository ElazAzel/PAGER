import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingExcludes: { "/*": ["./.data/**/*", "./docs/**/*", "./tests/**/*", "./scripts/**/*", "./.git/**/*"] },
  async headers() { return [{ source: "/:path*", headers: [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" }
  ] }, ...["/api/:path*", "/dashboard/:path*", "/admin/:path*", "/login/:path*", "/purchases/:path*", "/checkout/:path*"].map(source => ({ source, headers: [
    { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    { key: "Cache-Control", value: "private, no-store" }
  ] }))]; }
};
export default config;
