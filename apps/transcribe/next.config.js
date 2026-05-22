/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a slim, self-contained server bundle that Docker can run with `node server.js`.
  output: 'standalone',
  // Native / runtime-loaded modules must not be bundled by webpack.
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'sqlite-vec', 'pdf-parse', 'mammoth'],
  },
  webpack: (config) => {
    config.externals = config.externals || []
    config.externals.push({ 'better-sqlite3': 'commonjs better-sqlite3' })
    return config
  },
}

module.exports = nextConfig
