/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Supabase Storage + Cloudflare Images / R2 remote patterns.
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "imagedelivery.net" },
    ],
  },
  experimental: {
    // Keep server bundles lean for the Cloudflare Workers runtime.
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;

// Enable the OpenNext Cloudflare adapter during local development so that
// `getCloudflareContext()` and bindings work with `next dev`.
// See https://opennext.js.org/cloudflare
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
