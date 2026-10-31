export type Role = 'ADMIN' | 'PLANNER' | 'EVENT_MANAGER' | 'FINANCE' | 'OPERATIONS';

/** Prisma Decimal fields serialise as strings; always pass through toNum()/inr(). */
export type Money = string | number;

export interface User { id: string; name: string; email: string; role: Role; status?: string; phone?: string | null; available?: boolean; monthlyCost?: Money; mustChangePassword?: boolean; lastLoginAt?: string | null }
export interface UserRef { id: string; name: string }
export interface Couple { id: string; brideName: string; groomName: string; phone?: string | null; email?: string | null; address?: string | null }

export interface Enquiry {
  id: string; couple: Couple; source: string; stage: string; preferredDate?: string | null; location?: string | null;
  guestCount?: number | null; budget?: Money | null; theme?: string | null; packageType: string; assignedTo?: UserRef | null;
  followUpAt?: string | null; notes?: string | null; lostReason?: string | null; convertedWeddingId?: string | null; createdAt: string;
  activities?: { id: string; type: string; message: string; createdAt: string }[];
}

export interface WeddingEvent { id: string; kind: string; name: string; date: string; venue?: string | null; expectedGuests: number }
export interface Wedding {
  id: string; name: string; couple?: Couple; location: string; venue?: string | null; startDate: string; endDate: string; eventDays: number;
  expectedGuests: number; actualGuests?: number | null; packageType: string; budget: Money; contractValue: Money; planner?: UserRef | null;
  plannerId?: string | null; status: string; theme?: string | null; progress?: number; events?: WeddingEvent[];
}

export interface Vendor {
  id: string; name: string; businessName?: string | null; category: string; contactName: string; phone: string; email?: string | null;
  address?: string | null; serviceAreas: string[]; basePrice?: Money | null; priceUnit?: string | null; available: boolean; rating: Money;
  gstin?: string | null; bankDetails?: string | null; active: boolean; services?: { id: string; name: string; unit: string; price: Money }[];
}

export interface QuotationItem { id?: string; name: string; description?: string | null; quantity: Money; unit: string; unitPrice: Money; taxRate: Money; additionalCharge: Money; included: boolean; total?: Money }
export interface Quotation {
  id: string; requestId: string; status: string; menu?: string | null; guests?: number | null; guestCapacity?: number | null; ratePerPlate?: Money | null;
  extraHourCharge?: Money | null; subtotal: Money; taxTotal: Money; additionalTotal: Money; grandTotal: Money; pricePerPlate?: Money | null;
  rating?: number | null; notes?: string | null; validUntil?: string | null; decisionNote?: string | null; items: QuotationItem[];
}
export interface QuotationRequest {
  id: string; rfqGroup: string; weddingId: string; vendorId: string; vendor: Vendor; category: string; title: string; brief?: string | null;
  status: string; closedAt?: string | null; createdAt: string; quotation?: Quotation | null; wedding?: { id: string; name: string };
}

export interface Task {
  id: string; weddingId: string; name: string; description: string; category: string; owner?: UserRef | null; ownerId?: string | null;
  dueDate: string; priority: string; status: string; weddingVendor?: { id: string; vendor?: { name: string } } | null;
  event?: { id: string; name: string } | null; evidenceNote?: string | null; completedAt?: string | null;
  dependsOn?: { dependsOnId: string }[];
  wedding?: { id: string; name: string };
}

export interface Guest {
  id: string; weddingId: string; name: string; phone?: string | null; email?: string | null; groupName?: string | null; category?: string | null;
  invitationStatus: string; rsvp: string; plusOnes: number; dietary?: string | null; accommodationNeeded: boolean; checkedIn: boolean; checkedInAt?: string | null; checkedInCount: number;
}

export interface Milestone { id: string; weddingId: string; type: string; dueDate: string; expectedAmount: Money; status: string; received?: Money; outstanding?: Money; payments?: ClientPayment[]; wedding?: { id: string; name: string } }
export interface ClientPayment { id: string; weddingId: string; milestoneId: string; amount: Money; method: string; reference?: string | null; paidAt: string; receiptNo: string; milestone?: { type: string }; wedding?: { id: string; name: string } }

export interface Expense {
  id: string; weddingId: string; vendor?: { id: string; name: string } | null; category: string; description: string; amount: Money; date: string;
  method: string; status: string; responsible?: UserRef | null; isTeamCost: boolean; receiptDocumentId?: string | null; wedding?: { id: string; name: string };
}

export interface TimelineItem { id: string; weddingId: string; eventId?: string | null; title: string; scheduledAt: string; actualAt?: string | null; responsible?: string | null; team?: string | null; notes?: string | null; delayMinutes: number; status: string }
export interface VendorArrival { id: string; weddingVendorId: string; expectedAt: string; actualAt?: string | null; status: string; delayMinutes: number; contactName?: string | null; contactPhone?: string | null; notes?: string | null; weddingVendor?: { id: string; category: string; vendor: { name: string } } }
export interface Incident { id: string; weddingId: string; title: string; description: string; severity: string; assignedTo?: UserRef | null; status: string; resolution?: string | null; createdAt: string; resolvedAt?: string | null }

export interface DocumentRow { id: string; weddingId?: string | null; wedding?: { name: string } | null; name: string; category: string; mimeType: string; size: number; version: number; documentKey: string; uploadedBy?: UserRef | null; allowedRoles: Role[]; createdAt: string }
export interface ActivityRow { id: string; entity: string; action: string; message?: string | null; actor?: UserRef | null; createdAt: string }

export interface RfqGroup {
  rfqGroup: string; weddingId: string; wedding: { id: string; name: string }; category: string; title: string; createdAt: string;
  invited: number; received: number; decided: boolean; status: string;
  requests: { id: string; vendor: { id: string; name: string }; status: string; quotationId: string | null; grandTotal: Money | null }[];
}
export interface CompareQuote {
  requestId: string; quotationId: string; requestStatus: string; status: string;
  vendor: { id: string; name: string; rating: number; contactName: string; phone: string };
  menu?: string | null; guests?: number | null; guestCapacity?: number | null; ratePerPlate?: Money | null; extraHourCharge?: Money | null;
  subtotal: Money; taxTotal: Money; additionalTotal: Money; grandTotal: Money; pricePerPlate?: Money | null; notes?: string | null; decisionNote?: string | null;
  items: QuotationItem[]; includedCount: number; excludedCount: number; capacityOk: boolean;
  flags: { lowest: boolean; bestValue: boolean; recommended: boolean }; score?: number;
}
export interface Comparison {
  rfqGroup: string | null; weddingId: string; category: string; title: string; brief?: string | null; decided: boolean; expectedGuests: number;
  quotations: CompareQuote[]; pending: { requestId: string; vendor: { id: string; name: string }; status: string }[];
  scoring: { lowest: string; bestValue: string; recommended: string };
}
export interface QuoteTarget { requestId: string; vendorName: string; category: string; expectedGuests: number; quote?: CompareQuote }
