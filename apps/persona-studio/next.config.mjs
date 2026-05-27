/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: 'aisales-minio' },
      { protocol: 'http', hostname: '46.62.215.11' },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
  },
  // Native bindings (.node) и yoga-wasm которые тащит satori/resvg не должны
  // ходить через webpack — пусть резолвятся require'ом в runtime.
  serverExternalPackages: ['@resvg/resvg-js', 'satori', 'yoga-wasm-web'],
};

export default nextConfig;
