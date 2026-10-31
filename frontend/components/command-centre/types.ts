import type { Incident, TimelineItem, UserRef, VendorArrival, WeddingEvent } from '@/types';

export interface CommandVendor {
  id: string; category: string; vendor: { id: string; name: string; contactName: string; phone: string; category: string };
  arrival: Omit<VendorArrival, 'weddingVendor'> | null;
}
export interface CommandState {
  serverTime: string;
  wedding: { id: string; name: string; venue?: string | null; location: string; status: string; startDate: string; endDate: string; couple?: { brideName: string; groomName: string } | null; planner?: (UserRef & { phone?: string | null }) | null };
  guests: { expected: number; confirmed: number; actual: number | null; checkedIn: number };
  events: WeddingEvent[]; currentEvent: WeddingEvent | null;
  timeline: (TimelineItem & { event?: { id: string; name: string } | null })[];
  vendors: CommandVendor[];
  incidents: (Incident & { assignedTo?: UserRef | null })[];
  staff: { id: string; name: string; role: string; phone?: string | null; openTasks: number; openIncidents: number }[];
  summary: { arrived: number; delayed: number; vendors: number; openIncidents: number };
}
