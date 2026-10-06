import type { NextConfig } from "next";

const buildLabel = process.env.COMMUNITY_BUILD_LABEL;
if (buildLabel && !/^[a-z0-9-]{1,40}$/.test(buildLabel)) {
  throw new Error("COMMUNITY_BUILD_LABEL must contain only lowercase letters, digits and hyphens.");
}

const nextConfig: NextConfig = {
  distDir: buildLabel ? `.local/build-${buildLabel}` : process.env.COMMUNITY_ISOLATED_BUILD === "1" ? ".local/next-build" : ".next",
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ] },
      // Pages and API answers can hold private data, so none is stored. The fingerprinted files under /_next/static are public and
      // never change, so they keep Next's own long-lived cache header; a blanket no-store would reload every script on each visit.
      { source: "/((?!_next/static|_next/image|favicon.ico).*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
