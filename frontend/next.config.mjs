import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '..'),
  outputFileTracingIncludes: {
    '/api/data/**/*': ['output/data.db', '../output/data.db'],
    '/api/download/**/*': ['../downloads/**/*.zip'],
  },
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3'],
  async rewrites() {
    return [
      { source: '/daily-report', destination: '/daily_report.html' },
      { source: '/notice', destination: '/notice.html' },
    ];
  },
};
export default nextConfig;
