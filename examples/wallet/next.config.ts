import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@rmj/sdk'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      buffer: 'buffer',
    };
    return config;
  },
};

export default nextConfig;
