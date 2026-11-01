import { EventKind, Priority, Role, TaskCategory, VendorCategory } from '@prisma/client';

export interface TemplateItemSeed { key: string; name: string; description: string; category: TaskCategory; offsetDays: number; priority?: Priority; ownerRole?: Role; dependsOnKey?: string; eventKind?: EventKind; vendorCategory?: VendorCategory }

const t = (key: string, name: string, description: string, category: TaskCategory, offsetDays: number, extra: Partial<TemplateItemSeed> = {}): TemplateItemSeed => ({ key, name, description, category, offsetDays, ...extra });

/** offsetDays = days BEFORE the first wedding day (negative = after the event). */
export const FULL_SERVICE_ITEMS: TemplateItemSeed[] = [
  t('venue-shortlist', 'Shortlist & site-visit venues', 'Visit 3 venues with the family and compare capacity, rooms and power backup.', 'VENUE', 150, { priority: 'HIGH' }),
  t('venue-book', 'Finalise and book venue', 'Sign venue contract and pay venue advance.', 'VENUE', 135, { priority: 'URGENT', dependsOnKey: 'venue-shortlist', vendorCategory: 'VENUE' }),
  t('venue-layout', 'Approve venue floor plans & layouts', 'Stage, seating, buffet and entry flow for each event.', 'VENUE', 75, { dependsOnKey: 'venue-book' }),
  t('design-theme', 'Finalise wedding theme & mood boards', 'Colour palette, motifs and look-book signed off by the couple.', 'DESIGN', 130, { priority: 'HIGH' }),
  t('design-invites', 'Design and print invitations', 'Invitation suite, digital e-invite and WhatsApp creative.', 'DESIGN', 110, { dependsOnKey: 'design-theme' }),
  t('deco-rfq', 'Collect 3 decoration quotations', 'Issue brief and gather comparable decoration quotes.', 'DECORATION', 120, { dependsOnKey: 'design-theme', vendorCategory: 'DECORATION' }),
  t('deco-book', 'Select and book decorator', 'Accept winning quotation and pay advance.', 'DECORATION', 100, { priority: 'HIGH', dependsOnKey: 'deco-rfq', vendorCategory: 'DECORATION' }),
  t('deco-mockup', 'Approve decoration mock-ups', '3D renders and material samples approved by the family.', 'DECORATION', 45, { dependsOnKey: 'deco-book', vendorCategory: 'DECORATION' }),
  t('cater-rfq', 'Collect 3 catering quotations', 'Menu tasting and per-plate comparison.', 'CATERING', 120, { vendorCategory: 'CATERING' }),
  t('cater-book', 'Select caterer and finalise menus', 'Accept quotation; menus for each event signed off.', 'CATERING', 95, { priority: 'URGENT', dependsOnKey: 'cater-rfq', vendorCategory: 'CATERING' }),
  t('cater-headcount', 'Lock final headcount with caterer', 'Confirm guaranteed plates and extra-plate rate in writing.', 'CATERING', 10, { priority: 'HIGH', dependsOnKey: 'cater-book', vendorCategory: 'CATERING', ownerRole: 'EVENT_MANAGER' }),
  t('photo-book', 'Book photography team', 'Shot list, team size and deliverables confirmed.', 'PHOTOGRAPHY', 110, { vendorCategory: 'PHOTOGRAPHY' }),
  t('photo-shotlist', 'Share family shot list', 'Key family groupings and rituals to cover.', 'PHOTOGRAPHY', 20, { dependsOnKey: 'photo-book', vendorCategory: 'PHOTOGRAPHY' }),
  t('video-book', 'Book videography team', 'Cinematic film, highlights reel and drone permissions.', 'VIDEOGRAPHY', 105, { vendorCategory: 'VIDEOGRAPHY' }),
  t('guest-list', 'Collect and clean guest list', 'Names, phone numbers, family groups and dietary needs.', 'GUEST_MANAGEMENT', 90, { priority: 'HIGH' }),
  t('guest-invite', 'Send invitations & start RSVP tracking', 'Send invites and log delivery status.', 'GUEST_MANAGEMENT', 70, { dependsOnKey: 'guest-list' }),
  t('guest-rsvp', 'Close RSVPs and chase pending guests', 'Call pending guests; reconcile plus-ones.', 'GUEST_MANAGEMENT', 21, { priority: 'HIGH', dependsOnKey: 'guest-invite' }),
  t('accom-block', 'Block hotel rooms for guests', 'Room block and rate sheet with hotel partners.', 'ACCOMMODATION', 100, { vendorCategory: 'ACCOMMODATION' }),
  t('accom-allocate', 'Allocate rooms to guests', 'Room list shared with hotel front desk.', 'ACCOMMODATION', 14, { dependsOnKey: 'accom-block', vendorCategory: 'ACCOMMODATION' }),
  t('transport-plan', 'Plan guest & family transport', 'Airport pickups, shuttles and baraat vehicles.', 'TRANSPORTATION', 60, { vendorCategory: 'TRANSPORTATION' }),
  t('transport-confirm', 'Confirm vehicles, drivers and routes', 'Driver contacts shared with the command centre.', 'TRANSPORTATION', 7, { dependsOnKey: 'transport-plan', vendorCategory: 'TRANSPORTATION', ownerRole: 'EVENT_MANAGER' }),
  t('ent-book', 'Book DJ, band and performers', 'Entertainment line-up for Sangeet and Reception.', 'ENTERTAINMENT', 90, { vendorCategory: 'ENTERTAINMENT' }),
  t('ent-sound', 'Plan sound & lighting design', 'Equipment list, generator needs and sound-check slots.', 'ENTERTAINMENT', 40, { dependsOnKey: 'ent-book', vendorCategory: 'SOUND' }),
  t('mehendi-plan', 'Plan Mehendi event', 'Artists, seating, snacks and music.', 'MEHENDI', 30, { eventKind: 'MEHENDI' }),
  t('sangeet-plan', 'Plan Sangeet programme & rehearsals', 'Performance order, rehearsal schedule and stage cues.', 'SANGEET', 30, { priority: 'HIGH', eventKind: 'SANGEET', dependsOnKey: 'ent-book' }),
  t('ceremony-plan', 'Plan wedding ceremony run-of-show', 'Muhurat, rituals, pandit and family choreography.', 'CEREMONY', 28, { priority: 'HIGH', eventKind: 'CEREMONY' }),
  t('ceremony-baraat', 'Plan baraat and entry logistics', 'Route, horse/ghodi, dhol and police permissions.', 'CEREMONY', 21, { eventKind: 'CEREMONY', vendorCategory: 'DRUMMERS' }),
  t('reception-plan', 'Plan reception flow', 'Stage moments, speeches and guest seating.', 'RECEPTION', 25, { eventKind: 'RECEPTION' }),
  t('final-timeline', 'Publish master event timeline', 'Hour-by-hour schedule loaded into the Command Centre.', 'FINAL_PREPARATION', 14, { priority: 'URGENT', ownerRole: 'EVENT_MANAGER' }),
  t('final-practice', 'Run practice walk-through', 'On-site practice run with vendors and family leads.', 'FINAL_PREPARATION', 5, { priority: 'HIGH', dependsOnKey: 'final-timeline', ownerRole: 'EVENT_MANAGER' }),
  t('final-vendor-brief', 'Brief all vendors & confirm arrival times', 'Call every vendor; confirm arrival, parking and contacts.', 'FINAL_PREPARATION', 2, { priority: 'URGENT', ownerRole: 'OPERATIONS', dependsOnKey: 'final-timeline' }),
  t('final-advance', 'Collect advance payment from client', 'Advance milestone due about one month before the wedding.', 'FINAL_PREPARATION', 30, { priority: 'HIGH', ownerRole: 'FINANCE' }),
  t('post-close', 'Post-event closure & final bill', 'Reconcile vendor bills, bill extras and close the wedding.', 'FINAL_PREPARATION', -5, { ownerRole: 'FINANCE' }),
];

export const FULL_SERVICE_TEMPLATE_NAME = 'Full-Service Wedding Checklist';
/** Partial / Day-of management: execution-focused and deliberately smaller than the full set (no venue, decoration, catering or design sourcing). */
export const PARTIAL_TEMPLATE_NAME = 'Partial / Day-of Scoped Checklist';
/** @deprecated older databases still hold this 27-task template; it is no longer chosen automatically. */
export const LEGACY_DAY_OF_TEMPLATE_NAME = 'Day-of Management Checklist';

const PARTIAL_KEYS = new Set([
  'venue-layout', 'cater-headcount', 'photo-shotlist', 'guest-rsvp', 'accom-allocate', 'transport-confirm', 'ent-sound',
  'mehendi-plan', 'sangeet-plan', 'ceremony-plan', 'ceremony-baraat', 'reception-plan',
  'final-timeline', 'final-practice', 'final-vendor-brief', 'final-advance', 'post-close',
]);
/** Day-of is a subtype of Partial (not a third package): only the event-day execution items of the Partial set. */
export const DAY_OF_KEYS = new Set(['mehendi-plan', 'sangeet-plan', 'ceremony-plan', 'reception-plan', 'cater-headcount', 'transport-confirm', 'final-timeline', 'final-practice', 'final-vendor-brief', 'post-close']);

export const PARTIAL_ITEMS: TemplateItemSeed[] = FULL_SERVICE_ITEMS.filter((i) => PARTIAL_KEYS.has(i.key)).map((i) => ({ ...i, dependsOnKey: i.dependsOnKey && PARTIAL_KEYS.has(i.dependsOnKey) ? i.dependsOnKey : undefined }));
export const DAY_OF_ITEMS: TemplateItemSeed[] = PARTIAL_ITEMS.filter((i) => DAY_OF_KEYS.has(i.key)).map((i) => ({ ...i, dependsOnKey: i.dependsOnKey && DAY_OF_KEYS.has(i.dependsOnKey) ? i.dependsOnKey : undefined }));

export const DEFAULT_TEMPLATES = [
  { name: FULL_SERVICE_TEMPLATE_NAME, packageType: 'FULL_SERVICE', items: FULL_SERVICE_ITEMS },
  { name: PARTIAL_TEMPLATE_NAME, packageType: 'PARTIAL', items: PARTIAL_ITEMS },
] as const;
