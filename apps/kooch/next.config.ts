import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
const config: NextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }, ...['/account/:path*', '/form/:path*', '/report/:path*', '/admin/:path*'].map(source => ({ source, headers: [
      { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
    ] }))];
  },
};
export default config;
