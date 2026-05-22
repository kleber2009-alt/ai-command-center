/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.fal.media" },
      { protocol: "https", hostname: "replicate.delivery" },
      { protocol: "https", hostname: "**.runware.ai" },
    ],
  },
};
export default nextConfig;
