/**
 * Build-time configuration (NEXT_PUBLIC_* is inlined into the client bundle).
 * With nothing set, the app is same-origin: /api/* and /socket.io are proxied by next.config rewrites.
 */
const trim = (v: string | undefined) => (v ?? '').trim().replace(/\/+$/, '');

const apiOrigin = trim(process.env.NEXT_PUBLIC_API_URL);

export const config = {
  /** Base for every REST call, e.g. "/api/v1" (same-origin) or "https://api.example.com/api/v1". */
  apiBase: apiOrigin ? (apiOrigin.endsWith('/api/v1') ? apiOrigin : `${apiOrigin}/api/v1`) : '/api/v1',
  /** Socket.IO origin; empty means same-origin. */
  wsUrl: trim(process.env.NEXT_PUBLIC_WS_URL) || apiOrigin.replace(/\/api\/v1$/, ''),
  keycloakUrl: trim(process.env.NEXT_PUBLIC_KEYCLOAK_URL),
  keycloakRealm: trim(process.env.NEXT_PUBLIC_KEYCLOAK_REALM) || 'royalknot',
  keycloakClientId: trim(process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID) || 'royalknot-web',
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === 'true',
} as const;

export const DEMO_PASSWORD = 'RoyalKnot@2026';

/** Seeded demo accounts shown by the role switcher (demo mode only). */
export const DEMO_USERS = [
  { email: 'arjun@royalknot.in', name: 'Arjun', role: 'FOUNDER', label: 'Founder / Admin' },
  { email: 'priya@royalknot.in', name: 'Priya', role: 'WEDDING_PLANNER', label: 'Wedding Planner' },
  { email: 'kabir@royalknot.in', name: 'Kabir', role: 'EVENT_MANAGER', label: 'Event Manager' },
  { email: 'meera@royalknot.in', name: 'Meera', role: 'FINANCE_MANAGER', label: 'Finance Manager' },
  { email: 'rohan@royalknot.in', name: 'Rohan', role: 'OPS_STAFF', label: 'Operations Staff' },
  { email: 'rahul.priya@gmail.com', name: 'Rahul & Priya', role: 'CLIENT', label: 'Couple / Client' },
  { email: 'vendor@royalcaterers.com', name: 'Royal Caterers', role: 'VENDOR', label: 'Vendor' },
  { email: 'admin@royalknot.in', name: 'System Admin', role: 'SYSADMIN', label: 'System Administrator' },
] as const;
