# CareerLens -- Try-It Report
> Tested: 2026-03-20
> Status: All Passing (40/40)

## Summary

Your app was tested automatically. Here's what happened:

| What Was Tested | Result |
|----------------|--------|
| App starts up | PASS |
| Login works | PASS (all 4 roles) |
| All pages load | 10 of 10 passing |
| Permissions work correctly | PASS |
| API is responding | PASS |
| Logout works | PASS (all 4 roles) |

## Login Testing

Each type of user was tested:

| User Type | Login | Dashboard | Pages Tested | Result |
|-----------|-------|-----------|-------------|--------|
| Super Admin | PASS | PASS | 10 of 10 | PASS |
| Admin | PASS | PASS | 10 of 10 | PASS |
| Pro User | PASS | PASS | 6 of 6 | PASS |
| User | PASS | PASS | 6 of 6 | PASS |

## Pages Tested

| Page | Super Admin | Admin | Pro User | User | Notes |
|------|-------------|-------|----------|------|-------|
| Dashboard | PASS | PASS | PASS | PASS | |
| Profile | PASS | PASS | PASS | PASS | |
| Jobs | PASS | PASS | PASS | PASS | |
| Applications | PASS | PASS | PASS | PASS | |
| Agents | PASS | PASS | PASS | PASS | |
| Settings | PASS | PASS | PASS | PASS | |
| Admin Users | PASS | PASS | N/A | N/A | Admin only |
| Admin Roles | PASS | PASS | N/A | N/A | Admin only |
| Admin Prompts | PASS | PASS | N/A | N/A | Admin only |
| Admin Settings | PASS | PASS | N/A | N/A | Admin only (NEW in v0.12.0) |

## New in This Release (v0.12.0)

- **Admin Settings page** (`/admin/settings`) -- all 23 .env variables configurable via UI
- 7 setting groups: Database (1), Authentication (3), Security (2), URLs (2), AI Provider (9), RAG/Embeddings (6), Mock Services (1)
- Sensitive values masked with eye-toggle reveal
- "Restart required" badges on settings that need a server restart
- Bulk save per group
- Full audit log with old/new value diffs
- RBAC: `app_settings.view` and `app_settings.edit` permissions

## Screenshots

Screenshots saved in `.try-it/screenshots/`:
- `mock-admin_dashboard.png` -- Super Admin dashboard
- `mock-admin_admin_settings.png` -- Admin Settings page (NEW)
- `mock-manager_admin_settings.png` -- Admin Settings as Admin role
- Plus screenshots for all pages per role

## How to Access Your App

- **Open your browser to:** http://localhost:3300
- **To log in as Super Admin:** Click "Sign In", pick "Admin User" (admin@career-lens.local)
- **To log in as Admin:** Click "Sign In", pick "Manager User" (manager@career-lens.local)
- **To log in as Pro User:** Click "Sign In", pick "Pro User" (pro@career-lens.local)
- **To log in as User:** Click "Sign In", pick "Regular User" (user@career-lens.local)

## Services Running

| Service | URL | Status |
|---------|-----|--------|
| Frontend | http://localhost:3300 | Healthy |
| Backend API | http://localhost:8300 | Healthy |
| Database | localhost:5600 | Healthy |
| Mock OIDC | http://localhost:10190 | Healthy |
| Mock Olivia | http://localhost:10191 | Healthy |

## Issues Found
None -- all tests passing.

## What to Do Next
- Explore your app in the browser (see instructions above)
- If something doesn't look right, tell me and I'll fix it
- To make changes, type **/resume-it**
