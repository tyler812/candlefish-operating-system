/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  typescript: {
    // Temporarily ignore build errors for faster development
    ignoreBuildErrors: false,
  },
  eslint: {
    // Temporarily ignore linting during builds
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'candlefish-assets.s3.amazonaws.com',
      },
    ],
  },
  env: {
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    GRAPHQL_ENDPOINT: process.env.GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql',
    WEBSOCKET_URL: process.env.WEBSOCKET_URL || 'ws://localhost:4000',
  },
  // Enable experimental features for better performance
  experimental: {
    serverComponentsExternalPackages: ['@apollo/client'],
  },
  // Webpack configuration for Apollo Client
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
}

module.exports = nextConfig