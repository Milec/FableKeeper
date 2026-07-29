import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext configuration for deploying FableKeeper to Cloudflare Workers.
 *
 * The default configuration is sufficient for Phase 1. As the platform grows we
 * can enable incremental cache (Cloudflare KV / R2), tag-based revalidation, and
 * durable-object based queues here without touching application code.
 *
 * @see https://opennext.js.org/cloudflare
 */
export default defineCloudflareConfig({
  // Example (enable once a KV namespace binding named NEXT_INC_CACHE_KV exists):
  // incrementalCache: kvIncrementalCache,
});
