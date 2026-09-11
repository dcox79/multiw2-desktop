import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['node:sqlite'],
  images: { unoptimized: true },
  outputFileTracingExcludes: { '*': ['.env*'] },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/calculator',
        destination: '/dashboard',
        permanent: true,
      },
      {
        source: '/command-center',
        destination: '/dashboard',
        permanent: true,
      },
      {
        source: '/benefits',
        destination: '/dashboard/benefits',
        permanent: true,
      },
      {
        source: '/scanner',
        destination: '/dashboard/scanner',
        permanent: true,
      },
      {
        source: '/scenarios',
        destination: '/dashboard/scenarios',
        permanent: true,
      },
      {
        source: '/tax-prep',
        destination: '/dashboard/tax-prep',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
