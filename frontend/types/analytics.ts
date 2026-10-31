import type { Money } from './index';

export interface MonthPoint { month: string; revenue: Money; received: Money; outstanding: Money; profit: Money }

export interface DashboardData {
  kpis: { totalWeddings: number; activeWeddings: number; activeEnquiries: number; activeVendors: number; pendingTasks: number; overdueTasks: number };
  ongoingWeddings: { id: string; name: string; location: string; venue?: string | null; startDate: string; endDate: string; status: string; expectedGuests: number; budget: Money | null; progress: number; planner?: string | null }[];
  taskOverview: { total: number; overdue: number; byStatus: Record<string, number> };
  today: {
    wedding: { id: string; name: string } | null;
    schedule: { id: string; title: string; scheduledAt: string; status: string; delayMinutes: number }[];
    vendorStatus: { id: string; category: string; vendor: { name: string }; arrival: { status: string; expectedAt: string; actualAt?: string | null; delayMinutes: number } | null }[];
  };
  recentEnquiries: { id: string; couple: string; preferredDate?: string | null; location?: string | null; budget?: Money | null; stage: string; assignedTo?: string | null }[];
  recentActivity: { id: string; message?: string | null; at: string; actor?: string | null; wedding?: string | null }[];
  finance: null | {
    contractedRevenue: Money; received: Money; receivedPct: number; netProfit: Money; marginPct: number; totalExpenses: Money;
    monthly: MonthPoint[];
    upcomingPayments: { id: string; weddingId: string; wedding: string; type: string; dueDate: string; expected: Money; received: Money; outstanding: Money; overdue: boolean }[];
  };
}

export interface FinanceTotals {
  weddings: number; revenue: Money; additionalRevenue: Money; vendorCosts: Money; teamCosts: Money; otherExpenses: Money; totalExpenses: Money;
  grossProfit: Money; netProfit: Money; marginPct: number; received: Money; receivables: Money; vendorPaid: Money; payables: Money; averageWeddingValue: Money;
}
export interface WeddingProfit {
  weddingId: string; name: string; location: string; startDate: string; status: string; packageType: string; contractValue: Money; additionalRevenue: Money;
  revenue: Money; vendorCosts: Money; teamCosts: Money; otherExpenses: Money; grossProfit: Money; netProfit: Money; marginPct: number;
  received: Money; receivables: Money; vendorPaid: Money; payables: Money;
}
export interface Overview {
  totals: FinanceTotals; statusCounts: Record<string, number>; monthly: MonthPoint[];
  mostProfitable: WeddingProfit[]; lowestMargin: WeddingProfit[];
  upcomingClientPayments: { id: string; weddingId: string; wedding: string; type: string; dueDate: string; expected: Money; received: Money; outstanding: Money; overdue: boolean }[];
  upcomingVendorPayments: { weddingVendorId: string; weddingId: string; wedding: string; vendor: string; category: string; dueDate: string; remainingPayable: Money; finalBill: Money }[];
}
export interface Profitability { weddings: WeddingProfit[]; totals: FinanceTotals }
export interface VendorPerf {
  id: string; name: string; category: string; rating: number; assignments: number; arrivalsRecorded: number; onTimeArrivals: number; timelinessPct: number | null;
  avgDelayMinutes: number; quoted: Money; actual: Money; costVariancePct: number | null; reliabilityScore: number; contractValue: Money;
}
export interface TeamLoad { id: string; name: string; email: string; role: string; assignedWeddings: number; completedTasks: number; openTasks: number; overdueTasks: number; available: boolean; status: string; lastLoginAt?: string | null }
