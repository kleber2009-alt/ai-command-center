/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  output: 'standalone',
  // npm workspaces monorepo — the file-tracing root must be the repo
  // root, otherwise the standalone bundle misses hoisted node_modules.
  outputFileTracingRoot: path.join(__dirname, '../..'),
}

module.exports = nextConfig
