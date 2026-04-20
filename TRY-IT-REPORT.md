# CareerLens -- Try-It Report
> Tested: 2026-04-20 11:53 CST
> Status: All Passing (29/29 pages)

## Summary

Your app was tested automatically. Here's what happened:

| What Was Tested | Result |
|----------------|--------|
| App starts up | PASS |
| Login works (3 roles) | PASS |
| All pages load (7 regular + 4 admin + details) | PASS |
| Permissions work correctly | PASS |
| Backend API is responding | PASS |
| Logout works for all roles | PASS |

## Login Testing

Each type of user was tested:

| User Type | Login | Pages Tested | Result |
|-----------|-------|-------------|--------|
| Super Admin (admin@career-lens.local) | PASS | 14 of 14 | PASS |
| Pro User (pro@career-lens.local) | PASS | 8 of 8 | PASS |
| Regular User (user@career-lens.local) | PASS | 7 of 7 | PASS |

## Pages Tested

| Page | Super Admin | Pro User | User | Notes |
|------|-------------|----------|------|-------|
| Command Center | PASS | PASS | PASS | |
| Profile | PASS | PASS | PASS | |
| Resumes | PASS | PASS | PASS | |
| Application Studio (list) | PASS | PASS | PASS | Now includes Discover Jobs, Import, + Add Job |
| Application Studio (detail) | PASS | PASS | -- | Analyze + Delete actions in header |
| Story Bank (list) | PASS | PASS | PASS | |
| Story Bank (detail) | PASS | -- | -- | |
| Story Bank (back nav) | PASS | -- | -- | |
| Interview Questions | PASS | PASS | PASS | |
| Analytics | PASS | PASS | PASS | |
| Admin > Users | PASS | -- | -- | Admin only |
| Admin > Roles | PASS | -- | -- | Admin only |
| Admin > AI Instructions | PASS | -- | -- | Admin only |
| Admin > Settings | PASS | -- | -- | Admin only |

## What Changed in This Build

**Job Listings consolidated into Application Studio** -- The separate Job Listings page has been removed. Everything now lives in Application Studio:

- **Discover Jobs** button -- search for job opportunities by keyword and location
- **Import from URL** button -- paste a job posting URL to auto-scrape and import
- **+ Add Job** button -- manually create a job with title, company, location, description
- **Analyze** and **Delete** -- available as row actions in the table AND in the workspace detail header
- Adding a job immediately creates an Application + Workspace and navigates to the detail view
- Sidebar no longer shows "Job Listings" as a separate page

## Screenshots

Screenshots of each page (per role) are saved in `.try-it/screenshots/`:

**Super Admin:**
- `mock-admin_command_center.png` -- Command Center
- `mock-admin_profile.png` -- User profile
- `mock-admin_resumes.png` -- Resume manager
- `mock-admin_agents.png` -- Application Studio (list with Discover/Import/Add buttons)
- `mock-admin_agents_detail.png` -- Workspace detail (with Analyze/Delete/Back)
- `mock-admin_stories.png` -- Story Bank
- `mock-admin_stories_detail.png` -- Story detail view
- `mock-admin_stories_back.png` -- Back to stories list
- `mock-admin_interview_questions.png` -- Interview questions
- `mock-admin_analytics.png` -- Analytics
- `mock-admin_admin_users.png` -- User management
- `mock-admin_admin_roles.png` -- Role management
- `mock-admin_ai_instructions.png` -- AI instructions
- `mock-admin_admin_settings.png` -- App settings

**Pro User:**
- `mock-pro_command_center.png` through `mock-pro_analytics.png`
- `mock-pro_agents.png` -- Application Studio list
- `mock-pro_agents_detail.png` -- Workspace detail

**Regular User:**
- `mock-user_command_center.png` through `mock-user_analytics.png`

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
- Try the new consolidated Application Studio: add a job, import one, or discover new listings
- If something doesn't look right, tell me and I'll fix it
- To make changes, just describe what you'd like different
- To shut down the app, tell me "stop the app"
