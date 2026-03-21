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
- [ ] Build RAG/CAG system for resume content storage and retrieval
- [ ] Implement Playwright-based job application form auto-fill (Coordinator Agent)

## Medium Priority
- [ ] Implement application follow-up reminders (email/notification)
- [x] Add resume version history per application
- [x] Add markdown rendering for agent artifacts (currently plain text)
- [x] Add artifact export (download as PDF/Word)
- [ ] NeMo Guardrails AI safety testing suite

## Low Priority
- [ ] Add job search capability (active job discovery)
- [ ] Add analytics dashboard for job search trends
- [ ] Add export functionality for applications data
- [ ] Add multi-language support
- [ ] Implement AI fallback model configuration
- [ ] Add Terraform infrastructure for Azure deployment
- [ ] Security scanner integration
