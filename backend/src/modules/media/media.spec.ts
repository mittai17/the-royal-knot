import { MediaKind } from '@prisma/client';
import { kindFor } from './media.service';

describe('media kind', () => {
  it('derives kind from mime and album', () => {
    expect(kindFor('video/mp4', 'gallery')).toBe(MediaKind.VIDEO);
    expect(kindFor('image/png', 'design-ideas')).toBe(MediaKind.REFERENCE);
    expect(kindFor('image/png', 'gallery')).toBe(MediaKind.PHOTO);
  });
});
