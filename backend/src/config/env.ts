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
  get upiVpa() { return get('UPI_VPA', 'royalknot@upi'); },
  /** Optional self-hosted Keycloak IdP. Built-in cookie auth keeps working whether or not this is on. */
  get keycloak() {
    const internalUrl = get('KEYCLOAK_INTERNAL_URL', 'http://keycloak:8080').replace(/\/$/, '');
    const realm = get('KEYCLOAK_REALM', 'royalknot');
    const internalIssuer = `${internalUrl}/realms/${realm}`;
    return {
      enabled: get('KEYCLOAK_ENABLED', 'false') === 'true',
      internalUrl, realm, internalIssuer,
      publicIssuer: get('KEYCLOAK_PUBLIC_ISSUER', internalIssuer),
      clientId: get('KEYCLOAK_CLIENT_ID', 'royalknot-web'),
      clientSecret: get('KEYCLOAK_CLIENT_SECRET', ''),
      apiClientId: get('KEYCLOAK_API_CLIENT_ID', 'royalknot-api'),
    };
  },
  get disableJobs() { return get('DISABLE_JOBS', 'false') === 'true'; },
};
