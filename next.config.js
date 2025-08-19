/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@e2b/code-interpreter']
  },
  images: {
    domains: ['localhost']
  }
}

module.exports = nextConfig