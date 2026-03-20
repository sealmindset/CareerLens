# CareerLens -- Try-It Report
> Tested: 2026-03-19
> Status: All Passing

## Summary

Your app was tested automatically. Here's what happened:

| What Was Tested | Result |
|----------------|--------|
| App starts up | PASS |
| Login works | PASS (all 4 roles) |
| All pages load | 6 of 6 passing |
| Permissions work correctly | PASS |
| API is responding | PASS |
| Seed data populated | PASS |
| Logout works | PASS |

## Login Testing

Each type of user was tested:

| User Type | Login | Dashboard | Endpoints | Admin Access | Result |
|-----------|-------|-----------|-----------|-------------|--------|
| Super Admin (mock-admin) | PASS | PASS | All 200 | Full access (25 perms) | PASS |
| Admin (mock-manager) | PASS | PASS | All 200 | Users yes, Roles no (21 perms) | PASS |
| Pro User (mock-pro) | PASS | PASS | All 200 | No admin (16 perms) | PASS |
| User (mock-user) | PASS | PASS | All 200 | No admin (5 perms) | PASS |

## Pages Tested

| Page | Super Admin | Admin | Pro User | User | Notes |
|------|-------------|-------|----------|------|-------|
| Dashboard | PASS | PASS | PASS | PASS | Shows 15 jobs, 5 apps, 10 skills |
| Profile | PASS | PASS | PASS | PASS | 10 skills, 2 experiences, 1 education |
| Jobs | PASS | PASS | PASS | PASS | 15 job listings with varied statuses |
| Applications | PASS | PASS | PASS | PASS | 5 applications across different stages |
| Agents | PASS | PASS | PASS | PASS | 6 AI agents, 3 seed conversations |
| Settings | PASS | PASS | PASS | N/A | Shows AI provider configuration |
| Admin Users | PASS | PASS | 403 | 403 | Correctly restricted |
| Admin Roles | PASS | 403 | 403 | 403 | Correctly restricted |

## Seed Data

| Data Type | Count | Notes |
|-----------|-------|-------|
| Users | 4 | One per role, matching mock-oidc test users |
| Job Listings | 15 | Varied companies, locations, salaries, statuses |
| Applications | 5 | Draft, tailoring, submitted, interviewing stages |
| Profile Skills | 10 | Python, TypeScript, React, Next.js, AWS, etc. |
| Work Experience | 2 | Current + previous positions |
| Education | 1 | BS Computer Science |
| Agent Conversations | 3 | Scout, coach, strategist agents |

## How to Access Your App

- **Open your browser to:** http://localhost:3300
- **To log in:** Click "Sign In" and pick a user from the login screen:
  - **Admin User** (admin@career-lens.local) -- Full access including user/role management
  - **Manager User** (manager@career-lens.local) -- All features plus user management
  - **Pro User** (pro@career-lens.local) -- Full job search features, no admin
  - **Regular User** (user@career-lens.local) -- View-only access

## Services Running

| Service | URL | Status |
|---------|-----|--------|
| Frontend | http://localhost:3300 | Healthy |
| Backend API | http://localhost:8300 | Healthy |
| Database | localhost:5600 | Healthy |
| Mock OIDC | http://localhost:10190 | Healthy |

## Issues Found
None -- all tests passed.

## What to Do Next
- Explore your app in the browser (see instructions above)
- If something doesn't look right, tell me and I'll fix it
- When you're happy with how it works, type **/ship-it** to deploy
- To make changes, type **/resume-it**
