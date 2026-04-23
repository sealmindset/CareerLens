# TODO

## High Priority
- [x] Set AZURE_AI_FOUNDRY_ENDPOINT in .env (dual-mode: API key or DefaultAzureCredential)
- [x] Implement web scraping for job listing URLs (httpx + BeautifulSoup + AI extraction)
- [x] Implement resume PDF/Word upload and parsing
- [x] Implement Scout Agent job matching algorithm (v0.5.0 -- match analysis + gap report)
- [x] Implement Tailor Agent resume rewriting logic (v0.5.0 -- tailored resume + keyword guide)
- [x] Implement Coach Agent interview prep (v0.5.0 -- prep guide + STAR responses)
- [x] Add Strategist Agent cover letter generation (v0.5.0 -- cover letter + strategy)
- [x] Add Brand Advisor company research (v0.5.0 -- company brief + culture analysis)
- [x] Implement Coordinator Agent orchestration (v0.5.0 -- checklist + follow-up plan)
- [x] Implement LinkedIn profile import
- [x] Build RAG/CAG system for resume content storage and retrieval
- [x] Implement Playwright-based job application form auto-fill (Coordinator Agent)

## Medium Priority
- [x] Implement application follow-up reminders (email/notification)
- [x] Add resume version history per application
- [x] Add resume variants system with version control, AI upload, auto-matching, tailor evaluation, and interview success tracking
- [x] Add markdown rendering for agent artifacts (currently plain text)
- [x] Add artifact export (download as PDF/Word)
- [x] NeMo Guardrails AI safety testing suite
- [x] AI-Powered Ageism Shield for Tailor agent (age signal detection + resume scrubbing)
- [x] Resume Review Loop: Achievement Amplifier + ATS Predictor + Hiring Manager Simulator

## Low Priority
- [x] Add job search capability (active job discovery)
- [x] Add analytics dashboard for job search trends
- [x] Add export functionality for applications data
- [ ] Add multi-language support
- [x] Implement AI fallback model configuration
- [x] Add Apple MLX smart routing for local AI inference on Apple Silicon
- [ ] Add Terraform infrastructure for Azure deployment
- [x] Security scanner integration

## Known Issues / Next Session
- [ ] Skill Gap Check UI (outlier detection) only appears right after Quick Capture processes a JD — add a persistent way to re-run it from Application Studio on existing job listings
- [ ] Re-run Tailor on Wealth Enhancement Group application to get an Identity-Shield-protected resume
- [x] Address 10 Dependabot security vulnerabilities flagged on GitHub (3 high, 6 moderate, 1 low) — 7 npm already fixed; pinned python-multipart>=0.0.26 and cryptography>=46.0.7 for remaining 3
