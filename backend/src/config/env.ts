const get = (k: string, d: string) => process.env[k] ?? d;
const first = (keys: string[], d: string) => keys.map((k) => process.env[k]).find((v) => v) ?? d;
export const DEV_JWT_SECRET = 'dev-only-change-me-please-0123456789abcdef';

export const env = {
  get port() { return parseInt(get('PORT', '4000'), 10); },
  get frontendUrl() { return first(['FRONTEND_URL', 'CORS_ORIGIN'], 'http://localhost:3100'); },
  get jwtSecret() { return first(['JWT_SECRET', 'JWT_ACCESS_SECRET'], DEV_JWT_SECRET); },
  get cookieSecure() { return get('COOKIE_SECURE', 'false') === 'true'; },
  get redisUrl() { return get('REDIS_URL', 'redis://localhost:6379'); },
  get gotenbergUrl() { return get('GOTENBERG_URL', 'http://localhost:3003'); },
  get minio() {
    return {
      endPoint: get('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(get('MINIO_PORT', '9000'), 10),
      accessKey: get('MINIO_ACCESS_KEY', 'royalknot'),
      secretKey: get('MINIO_SECRET_KEY', 'royalknot_dev_secret'),
      bucket: get('MINIO_BUCKET', 'royalknot'),
      useSSL: get('MINIO_USE_SSL', 'false') === 'true',
    };
  },
  get smtp() { return { host: get('SMTP_HOST', ''), port: parseInt(get('SMTP_PORT', '1025'), 10), from: first(['SMTP_FROM', 'MAIL_FROM'], 'hello@theroyalknot.local') }; },
  get authRateLimit() { return parseInt(get('AUTH_RATE_LIMIT', '10'), 10); },
  get disableJobs() { return get('DISABLE_JOBS', 'false') === 'true'; },
};
