/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Slim, self-contained server bundle for Docker: `node server.js`.
  output: 'standalone',
};

module.exports = nextConfig;
