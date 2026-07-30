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
    serverActions: {
      // Azgaar map imports are by far the largest payload the app accepts. The
      // client compacts an export before uploading — dropping the cell grid,
      // vertices, and coats of arms, around 80% of the file — but a very large
      // world still clears the 1 MB default.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;

// Enable the OpenNext Cloudflare adapter during local development so that
// `getCloudflareContext()` and bindings work with `next dev`.
// See https://opennext.js.org/cloudflare
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
