# Requirements Traceability Register (first draft)

Source: docs/MASTER_SPEC.md. Details and evidence: docs/GAP_ANALYSIS.md. Status as of commit 7b2898b. Test column lists existing coverage only.

| Req | Requirement | Status | Code | Test | Work package |
|---|---|---|---|---|---|
| HD1 | 8 roles, FOUNDER not ADMIN | Missing | schema.prisma Role, common/permissions.ts, lib/nav.ts | keycloak.service.spec.ts | WP1 |
| HD2 | Agreement signed before vendor/floor-plan disclosure | Missing | portal-client.service.ts | none | WP2 |
| HD3 | Draft vs confirmed wedding, 3 separate status fields | Missing | weddings.service.ts, enquiries.service.ts, analytics.service.ts | none | WP1, WP2, WP3 |
| HD4 | Vendor sequence, auto-close competing RFQs | Partial | quotations.service.ts | workflows.e2e-spec.ts section 4 | WP2 |
| HD5 | Auto-planning after confirmed + verified deposit | Partial | payments.service.ts, tasks.service.ts | workflows.e2e-spec.ts section 5 | WP2, WP3 |
| HD6 | Configurable payment milestones | Partial | common/milestones.ts | finance.spec.ts | WP2, WP3 |
| HD7 | Financial module separation, Vendor Payments module | Partial | payments.service.ts, vendor-bills.service.ts | finance.e2e-spec.ts | WP3 |
| HD8 | One canonical module, legacy redirects | Partial | lib/nav.ts, next.config.mjs | frontend/e2e/wedflow-sweep.spec.ts | WP4, WP5 |
| HD9 | Canonical state lists | Partial | schema.prisma enums | various | WP1 |
| HD10 | Approvals, maker-checker | Partial | approvals.service.ts, expenses.service.ts, vendor-bills.service.ts | finance.e2e-spec.ts (discount approval) | WP3 |
| HD11 | Financial integrity, reversals, audit immutability | Partial | audit.service.ts, payments.service.ts | workflows.e2e-spec.ts (idempotency) | WP1, WP3 |
| HD12 | 15 security tests | 6 covered, 6 partial, 3 missing | see GAP_ANALYSIS 3(i) | portal.e2e-spec.ts, workflows.e2e-spec.ts | WP6 |
| HD13 | Demo data, DEMO label | Partial | prisma/seed.ts | none | WP1 |
| HD14 | Required docs | Partial | backend/docs/ER.md | n/a | WP6 |

Module-level rows (32 modules, 8 sidebars) are tabulated in docs/GAP_ANALYSIS.md section 4 and should be expanded here as work packages complete.
