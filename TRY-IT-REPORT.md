# CareerLens -- Try-It Report
> Tested: 2026-04-19T15:25:00
> Status: All Passing (37/37 tests)

## Summary

Your app was tested automatically. Here's what happened:

| What Was Tested | Result |
|----------------|--------|
| App starts up | PASS |
| Login works (3 roles) | PASS |
| All pages load (11 regular + 4 admin) | PASS |
| Permissions work correctly | PASS |
| Backend API is responding | PASS |
| Mock OIDC is responding | PASS |

## Login Testing

Each type of user was tested:

| User Type | Login | Dashboard | Pages Tested | Result |
|-----------|-------|-----------|-------------|--------|
| Super Admin (admin@career-lens.local) | PASS | PASS | 15 of 15 | PASS |
| Pro User (pro@career-lens.local) | PASS | PASS | 11 of 11 | PASS |
| Regular User (user@career-lens.local) | PASS | PASS | 11 of 11 | PASS |

## Pages Tested

| Page | Super Admin | Pro User | User | Notes |
|------|-------------|----------|------|-------|
| Dashboard | PASS | PASS | PASS | |
| Jobs | PASS | PASS | PASS | |
| Agents | PASS | PASS | PASS | |
| Interview Questions | PASS | PASS | PASS | |
| Profile | PASS | PASS | PASS | |
| Applications | PASS | PASS | PASS | Redirects to Agents (by design) |
| Resumes | PASS | PASS | PASS | |
| Stories | PASS | PASS | PASS | |
| Analytics | PASS | PASS | PASS | |
| Command Center | PASS | PASS | PASS | |
| Admin > Users | PASS | -- | -- | Admin only |
| Admin > Roles | PASS | -- | -- | Admin only |
| Admin > Settings | PASS | -- | -- | Admin only |
| Admin > AI Instructions | PASS | -- | -- | Admin only |

## Screenshots

Screenshots of each page (per role) are saved in `.try-it/screenshots/`:

**Super Admin:**
- `mock-admin_dashboard.png` -- Main dashboard
- `mock-admin_jobs.png` -- Job listings
- `mock-admin_agents.png` -- AI agents
- `mock-admin_interview-questions.png` -- Interview prep
- `mock-admin_profile.png` -- User profile
- `mock-admin_resumes.png` -- Resume manager
- `mock-admin_stories.png` -- Story bank
- `mock-admin_analytics.png` -- Analytics
- `mock-admin_command-center.png` -- Command center
- `mock-admin_admin-users.png` -- User management
- `mock-admin_admin-roles.png` -- Role management
- `mock-admin_admin-settings.png` -- App settings
- `mock-admin_admin-prompts.png` -- AI instructions

**Pro User:**
- `mock-pro_dashboard.png` through `mock-pro_command-center.png`

**Regular User:**
- `mock-user_dashboard.png` through `mock-user_command-center.png`

## How to Access Your App

- **Open your browser to:** http://localhost:3300
- **To log in as Admin:** Click "Sign In", pick "Admin User" from the login screen
- **To log in as Pro User:** Click "Sign In", pick "Pro User" from the login screen
- **To log in as Regular User:** Click "Sign In", pick "Regular User" from the login screen

## Services Running

| Service | URL | Status |
|---------|-----|--------|
| Frontend | http://localhost:3300 | Healthy |
| Backend API | http://localhost:8300 | Healthy |
| Mock OIDC | http://localhost:10190 | Healthy |
| Mock Olivia | http://localhost:10191 | Healthy |
| PostgreSQL | localhost:5600 | Healthy |

## Issues Found
None -- all tests passing.

## What to Do Next
- Explore your app in the browser (see instructions above)
- If something doesn't look right, tell me and I'll fix it
- When you're happy with how it works, type **/ship-it** to deploy
- To make changes, type **/resume-it**
