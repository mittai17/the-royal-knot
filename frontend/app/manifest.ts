import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'The Royal Knot Operations',
    short_name: 'The Royal Knot',
    description: 'Luxury Wedding Planning & Real-Time Event Operations ERP · Jaipur & Udaipur',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#F7F5F1',
    theme_color: '#401827',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}

