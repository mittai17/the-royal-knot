const backend = process.env.BACKEND_URL || 'http://127.0.0.1:4000';
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Socket.IO requests /socket.io/ with a trailing slash; a redirect would break the proxied handshake.
  skipTrailingSlashRedirect: true,
  // Decision 8 (one canonical module per domain): legacy routes redirect to their role-aware home. Not permanent so they can be retargeted.
  async redirects() {
    return [
      { source: '/todays-events', destination: '/command-centre?view=today', permanent: false },
      { source: '/vendor-checkin', destination: '/command-centre/vendor-checkin', permanent: false },
      { source: '/checklists', destination: '/tasks?view=checklists', permanent: false },
      { source: '/updates', destination: '/activity', permanent: false },
      { source: '/quotations', destination: '/procurement?tab=rfqs', permanent: false },
    ];
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/socket.io', destination: `${backend}/socket.io/` },
      { source: '/socket.io/:path*', destination: `${backend}/socket.io/:path*` },
    ];
  },
};
export default nextConfig;
