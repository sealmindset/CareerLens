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
| Resume upload UI | PASS |

## Login Testing

Each type of user was tested:

| User Type | Login | Dashboard | Endpoints | Admin Access | Result |
|-----------|-------|-----------|-----------|-------------|--------|
| Super Admin (mock-admin) | PASS | PASS | All 200 | Full access (27 perms) | PASS |
| Admin (mock-manager) | PASS | PASS | All 200 | Users yes, Roles no (23 perms) | PASS |
| Pro User (mock-pro) | PASS | PASS | All 200 | No admin (16 perms) | PASS |
| User (mock-user) | PASS | PASS | All 200 | No admin (5 perms) | PASS |

## Pages Tested

| Page | Super Admin | Admin | Pro User | User | Notes |
|------|-------------|-------|----------|------|-------|
| Dashboard | PASS | PASS | PASS | PASS | Shows jobs, apps, skills stats |
| Profile | PASS | PASS | PASS | PASS | Resume upload visible, profile data populated |
| Jobs | PASS | PASS | PASS | PASS | Job listings with Import from URL |
| Applications | PASS | PASS | PASS | PASS | Pipeline tracker |
| Agents | PASS | PASS | PASS | PASS | 6 AI agents with tiers |
| Settings | PASS | PASS | PASS | N/A | AI provider configuration |
| Admin Users | PASS | PASS | 403 | 403 | Correctly restricted |
| Admin Roles | PASS | 403 | 403 | 403 | Correctly restricted |

## New Feature: Resume Upload (v0.4.0)

The Profile page now includes drag-and-drop resume upload:
- **Upload Resume** button in the Resume Text section
- Supports PDF, Word (.docx), and plain text files
- 10 MB file size limit
- AI-powered parsing extracts headline, summary, skills, experience, and education
- Extracted data auto-populates profile fields (skip duplicate skills)
- Raw resume text stored for AI agents to reference later

## Screenshots

Screenshots saved in `.try-it/screenshots/`:
- `01_login.png` - Login page with "Sign in with SSO"
- `02_mock_oidc.png` - Mock OIDC user picker
- `03_after_login.png` - Post-login redirect
- `04_dashboard.png` - Dashboard with stats and quick actions
- `05_profile.png` - Profile page with Upload Resume button
- `06_jobs.png` - Job Listings with scraped Valvoline job
- `07_applications.png` - Applications pipeline
- `08_agents.png` - AI Agents console (6 agents)

## How to Access Your App

- **Open your browser to:** http://localhost:3300
- **To log in:** Click "Sign in with SSO" and pick a user from the login screen:
  - **Admin User** (admin@career-lens.local) -- Full access including user/role management
  - **Manager User** (manager@career-lens.local) -- All features plus user management
  - **Pro User** (pro@career-lens.local) -- Full job search features, no admin
  - **Regular User** (user@career-lens.local) -- View-only access

## To Test Resume Upload

1. Log in and go to **My Profile**
2. Scroll down to the **Resume Text** section
3. Click **Upload Resume** or drag-and-drop a PDF/Word/text file
4. AI will parse the document and auto-fill skills, experience, and education
5. A summary will show how many skills, experiences, and educations were added

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
