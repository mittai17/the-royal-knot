const backend = process.env.BACKEND_URL || 'http://localhost:4000';
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Socket.IO requests /socket.io/ with a trailing slash; a redirect would break the proxied handshake.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/socket.io', destination: `${backend}/socket.io/` },
      { source: '/socket.io/:path*', destination: `${backend}/socket.io/:path*` },
    ];
  },
};
export default nextConfig;
