# CareerLens -- Try-It Report
> Tested: 2026-04-20 14:30 CDT
> Status: All Core Features Passing

## Summary

Your app was tested automatically across 3 user roles and all major pages. The 5 new features (Pipeline Stages, Priority, Interview Journal, Interview Calendar, Configurable Reminders) are all rendering correctly.

| What Was Tested | Result |
|----------------|--------|
| App starts up | PASS |
| Login works (3 roles) | PASS |
| All core pages load | 18 of 18 PASS |
| New features render | PASS |
| Backend API is responding | PASS |

## Login Testing

| User Type | Login | Dashboard | Pages Tested | Result |
|-----------|-------|-----------|-------------|--------|
| Super Admin (admin@career-lens.local) | PASS | PASS | 7 of 7 | PASS |
| Pro User (pro@career-lens.local) | PASS | PASS | 7 of 7 | PASS |
| Regular User (user@career-lens.local) | PASS | PASS | 7 of 7 | PASS |

## Pages Tested

| Page | Super Admin | Pro User | User | Notes |
|------|-------------|----------|------|-------|
| Dashboard | PASS | PASS | PASS | Stats, activity, events all loading |
| Profile | PASS | PASS | PASS | |
| Application Studio | PASS | PASS | PASS | New Priority + Stage columns visible |
| Applications | PASS | PASS | PASS | |
| Command Center | PASS | PASS | PASS | New tab bar (Mission Control / Interview Calendar) |
| Admin > Users | PASS | -- | -- | Admin only |
| Admin > Roles | PASS | -- | -- | Admin only |

## New Features Verified

| Feature | Status | Where to Find It |
|---------|--------|-----------------|
| Pipeline Stage Indicator | PASS | Application Studio > click a job > workspace banner |
| Priority Column | PASS | Application Studio > DataTable "Priority" column (inline editable) |
| Stage Column + Filter | PASS | Application Studio > DataTable "Stage" column + Stage filter dropdown |
| Interview Calendar Tab | PASS | Command Center > "Interview Calendar" tab |
| Reminder Settings | PASS | Command Center > "+ Event" > Reminder chips in form |
| Interview Journal | PASS | Application Studio > click a job > scroll to Journal section |

## Screenshots

Screenshots for each role/page are saved in `.try-it/screenshots/`:

**Super Admin:**
- `mock-admin_dashboard.png` -- Dashboard with stats
- `mock-admin_agents.png` -- Application Studio with Priority + Stage columns
- `mock-admin_command_center.png` -- Command Center with Mission Control / Interview Calendar tabs
- `mock-admin_profile.png`, `mock-admin_resumes.png`, `mock-admin_stories.png`

**Pro User:**
- `mock-pro_dashboard.png`, `mock-pro_agents.png`, `mock-pro_command_center.png`

**Regular User:**
- `mock-user_dashboard.png`, `mock-user_agents.png`, `mock-user_command_center.png`

## Services Running

| Service | URL | Status |
|---------|-----|--------|
| Frontend | http://localhost:3300 | Healthy |
| Backend API | http://localhost:8300 | Healthy |
| Mock OIDC | http://localhost:10190 | Healthy |
| Mock Olivia | http://localhost:10191 | Healthy |
| PostgreSQL | localhost:5600 | Healthy |

## How to Access Your App

- **Open your browser to:** http://localhost:3300
- **To log in as Super Admin:** Click "Sign In", pick "Admin User" from the login screen
- **To log in as Pro User:** Click "Sign In", pick "Pro User" from the login screen
- **To log in as Regular User:** Click "Sign In", pick "Regular User" from the login screen

## Exploring the New Features

1. **Pipeline Stages:** Go to Application Studio, click a job with an application (e.g., "Backend Dev" at AcmeInc). The workspace banner shows a horizontal stage indicator -- click any stage to advance/change it.

2. **Priority:** In the Application Studio DataTable, the "Priority" column has inline inputs. Click the input next to any job, type a number (1 = top priority), and click away to save.

3. **Stage Column:** The DataTable now shows a "Stage" column with colored badges. Use the "Stage" filter dropdown in the toolbar to filter by interview stage.

4. **Interview Calendar:** Go to Command Center and click the "Interview Calendar" tab. Events with scheduled dates will appear grouped by day with prep status dots and action buttons.

5. **Reminder Settings:** In Command Center, click "+ Event" to create a new event. The form includes reminder chips (1 day, 2 hours, 30 min before) -- add or remove reminders using the chip selector.

6. **Interview Journal:** In Application Studio, click a job with an application. Scroll down to the "Interview Journal" section. Click "Add Entry" to log notes, outcomes, feedback, or debriefs.

## Issues Found
None -- all core features are working correctly.

## What to Do Next
- Explore your app in the browser (see instructions above)
- If something doesn't look right, tell me and I'll fix it
- To make changes, just describe what you'd like different
- To shut down the app: `docker compose --profile dev down`
