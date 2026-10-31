import { Matches } from 'class-validator';

/** Lenient UUID check (any hex 8-4-4-4-12): seeded demo ids such as 2222...2222 are not RFC-variant UUIDs. */
export const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const IsId = (each = false) => Matches(ID_RE, { each, message: each ? 'each value must be an id' : 'must be an id' });
