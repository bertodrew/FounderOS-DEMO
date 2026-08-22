/** @type {import('next').NextConfig} */
const nextConfig = {
  // Isolate the build output dir via env so a production build can run on its
  // own port without clobbering a concurrent `next dev` (which keeps `.next`).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Emits .next/standalone with a self-contained server.js and only the traced
  // node_modules, so the production image ships without dev dependencies.
  output: 'standalone',
  // Security headers are set in middleware.ts, which covers API responses and
  // denials too; keeping them in one place avoids the two drifting apart.
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'node-ical', 'nodemailer'],
  },
};

export default nextConfig;
