import type { NextConfig } from 'next';

const config: NextConfig = {
  // Workspace packages ship TypeScript source; let Next transpile them.
  transpilePackages: ['@vp/shared', '@vp/db', '@vp/queue', '@vp/storage', '@vp/ai', '@vp/ui'],
  experimental: {
    // db/queue/storage pull native + node-only deps; keep them server-external.
    serverComponentsExternalPackages: ['postgres', 'bullmq', 'ioredis', '@aws-sdk/client-s3'],
  },
};

export default config;
