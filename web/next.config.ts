import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/deliberations/:path*',
        destination: '/talks/:path*',
        permanent: true,
      },
      {
        source: '/communities/:path*',
        destination: '/rallies/:path*',
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
