import type { NextConfig } from 'next';

const config: NextConfig = {
  // Workspace packages ship TypeScript source; let Next transpile them.
  transpilePackages: ['@vp/shared', '@vp/db', '@vp/queue', '@vp/storage', '@vp/ai', '@vp/ui'],
  // db/queue/storage/ai pull native or node-only deps; keep them server-external
  // so webpack doesn't try to bundle them (Next 15: top-level key).
  serverExternalPackages: [
    'postgres',
    'bullmq',
    'ioredis',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    '@anthropic-ai/sdk',
    'openai',
    '@deepgram/sdk',
  ],
  webpack(cfg) {
    // The @vp/* packages import their own files with explicit .js specifiers
    // (NodeNext/ESM style). Tell webpack to resolve those to the .ts sources.
    cfg.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return cfg;
  },
};

export default config;
