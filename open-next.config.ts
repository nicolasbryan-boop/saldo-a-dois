import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({
  // No incremental cache: every authenticated page in this product is
  // per-household and must not be shared between requests.
});
