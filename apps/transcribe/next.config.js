/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // standalone build collects deps from the workspace root; tell it where root is.
  outputFileTracingRoot: require('path').join(__dirname, '../../'),
}
module.exports = nextConfig
