import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // auth + api run on paycall-server; proxied → cookies first-party here
  rewrites: async () => [{ source: "/api/:path*", destination: `${process.env.PAYCALL_API_URL!.replace(/\/$/, "")}/api/:path*` }],
  // old dashboard urls
  redirects: async () => [
    { source: "/buyer", destination: "/app/spend", permanent: true },
    { source: "/seller", destination: "/app/earn", permanent: true },
  ],
};

export default nextConfig;
