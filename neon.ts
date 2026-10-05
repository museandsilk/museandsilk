import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Managed Better Auth (injects NEON_AUTH_BASE_URL / NEON_AUTH_JWKS_URL).
  auth: true,
  buckets: {
    // Public-read: product, category and campaign images are fetched anonymously through the
    // Cloudflare CDN (see lib/media-url.ts). Writes still require the S3 credentials in .env.
    "nure-asmir-media": { access: "public_read" },
    // Private: customer payment proofs, only readable through admin presigned URLs.
    "nure-asmir-private": { access: "private" },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
