// Vaidyah Healthcare Platform – Next.js configuration
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['antd', '@ant-design/icons', '@ant-design/charts'],
  },
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';
    const csp = isDev
      ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss: *.amazonaws.com; frame-ancestors 'none';"
      : `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ${process.env.API_GATEWAY_URL || ''} *.amazonaws.com; frame-ancestors 'none';`;

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
  async rewrites() {
    const apiUrl = process.env.API_GATEWAY_URL;
    if (!apiUrl) return [];
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
      },
      {
        source: '/auth/:path*',
        destination: `${process.env.AUTH_SERVICE_URL || apiUrl}/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
