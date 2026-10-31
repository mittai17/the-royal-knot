export interface FnVendor { id: string; category: string; vendor: { id: string; name: string; phone?: string | null } }
export interface EventFunction {
  id: string; weddingId: string; wedding: { id: string; name: string; venue?: string | null; location: string };
  kind: string; name: string; date: string; endAt: string | null; venue: string | null; expectedGuests: number; notes: string | null;
  status: 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; statusOverride: string | null; vendors: FnVendor[]; timeline: { total: number; done: number };
}
export interface CalendarTask { id: string; name: string; dueDate: string; status: string; priority: string; category: string; wedding: { id: string; name: string }; owner: { id: string; name: string } | null }
export interface ArrivalRow {
  id: string; weddingId: string; wedding: { id: string; name: string }; category: string;
  vendor: { id: string; name: string; contactName: string; phone: string; category: string };
  arrival: { id: string; expectedAt: string; actualAt: string | null; status: string; delayMinutes: number; contactName?: string | null; contactPhone?: string | null; notes?: string | null } | null;
  bucket: 'pending' | 'arrived' | 'delayed' | 'completed'; overdueMinutes: number;
}
export interface ArrivalCounts { total: number; expected: number; arrived: number; pending: number; delayed: number; completed: number; untracked: number }
export interface IncidentRow {
  id: string; weddingId: string; wedding: { id: string; name: string }; title: string; description: string; severity: string; status: string;
  resolution?: string | null; createdAt: string; resolvedAt?: string | null; assignedToId?: string | null; assignedTo?: { id: string; name: string } | null;
}
export interface IncidentStats { open: number; inProgress: number; resolved: number; highPriorityOpen: number; total: number }

export interface Hotel { id: string; name: string; city?: string | null; address?: string | null; phone?: string | null; email?: string | null; starRating?: number | null; notes?: string | null; active: boolean; roomCount: number; capacity: number; occupied: number; occupancyPct: number }
export interface RoomRow {
  id: string; hotelId: string; number: string; type: string; capacity: number; rate: number; active: boolean; occupants: number; free: number;
  allocations: { id: string; guest?: { id: string; name: string } | null }[];
}
export interface Allocation {
  id: string; weddingId: string; roomId: string; guestId?: string | null; status: string; checkIn: string; checkOut: string; checkedInAt?: string | null; checkedOutAt?: string | null; notes?: string | null;
  room: { id: string; number: string; type: string; capacity: number; hotel: { id: string; name: string; city?: string | null } };
  guest?: { id: string; name: string; groupName?: string | null; phone?: string | null } | null; wedding?: { id: string; name: string };
}
export interface AccommodationStats { rooms: number; capacity: number; reserved: number; checkedIn: number; checkedOut: number; cancelled: number; occupiedTonight: number; occupancyPct: number; guestsNeedingRooms: number; guestsWithRooms: number; guestsWithoutRooms: number }
export interface LooseGuest { id: string; name: string; groupName?: string | null; accommodationNeeded: boolean; plusOnes: number; rsvp: string }

export interface Vehicle { id: string; plate: string; type: string; capacity: number; vendorName?: string | null; active: boolean; upcomingTrips: number; nextTrip: { scheduledAt: string; title: string } | null; onTrip: boolean }
export interface Driver { id: string; name: string; phone: string; licenseNo?: string | null; active: boolean; vendor?: { id: string; name: string } | null; upcomingTrips: number; onTrip: boolean }
export interface GuestTransportRow {
  id: string; guestId: string; tripId?: string | null; kind: string; flightOrTrain?: string | null; arrivalAt?: string | null; status: string; passengers: number; notes?: string | null;
  guest: { id: string; name: string; phone?: string | null; weddingId: string; groupName?: string | null };
  trip?: { id: string; title: string; scheduledAt: string; status: string; vehicle?: { plate: string; type: string } | null; driver?: { name: string; phone: string } | null } | null;
}
export interface Trip {
  id: string; weddingId: string; wedding: { id: string; name: string }; title: string; origin: string; destination: string; scheduledAt: string; startedAt?: string | null; completedAt?: string | null; status: string; notes?: string | null;
  vehicleId?: string | null; driverId?: string | null; vehicle?: { id: string; plate: string; type: string; capacity: number } | null; driver?: { id: string; name: string; phone: string } | null; seatsUsed: number;
}
export interface TransportStats { vehicles: number; drivers: number; trips: { scheduled: number; inProgress: number; completed: number; cancelled: number }; guests: { pending: number; assigned: number; pickedUp: number; dropped: number; cancelled: number; unassigned: number } }

export interface ChecklistItem { id: string; checklistId: string; title: string; done: boolean; doneAt?: string | null; dueDate?: string | null; sortOrder: number }
export interface Checklist { id: string; name: string; weddingId?: string | null; wedding?: { id: string; name: string } | null; clientVisible: boolean; items: ChecklistItem[]; progress: { total: number; done: number; pct: number } }
export interface FieldReport {
  id: string; createdAt: string; weddingId: string | null; wedding: { id: string; name: string } | null; author: { id: string; name: string } | null;
  type: 'DAILY' | 'TASK' | 'EVENT'; title: string; summary: string; progress?: number; issues?: string; nextSteps?: string; attendance?: number; taskId?: string; functionId?: string;
  photos: { id: string; name: string; mimeType: string }[];
}
