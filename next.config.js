/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone build — кладёт всё необходимое (server.js + node_modules)
  // в .next/standalone/, и Docker-образ собирается тонкий, без полного
  // node_modules.
  output: 'standalone',
}
module.exports = nextConfig
