# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: screenshots.spec.ts >> Screenshots - Admin >> admin_admin-prompts
- Location: e2e/screenshots.spec.ts:35:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForLoadState: Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]: C
        - generic [ref=e6]: CareerLens
      - navigation [ref=e7]:
        - list [ref=e8]:
          - listitem [ref=e9]:
            - link "Command Center" [ref=e10] [cursor=pointer]:
              - /url: /command-center
              - img [ref=e11]
              - generic [ref=e15]: Command Center
          - listitem [ref=e16]:
            - link "My Profile" [ref=e17] [cursor=pointer]:
              - /url: /profile
              - img [ref=e18]
              - generic [ref=e22]: My Profile
          - listitem [ref=e23]:
            - link "Resumes" [ref=e24] [cursor=pointer]:
              - /url: /resumes
              - img [ref=e25]
              - generic [ref=e30]: Resumes
          - listitem [ref=e31]:
            - link "Job Listings" [ref=e32] [cursor=pointer]:
              - /url: /jobs
              - img [ref=e33]
              - generic [ref=e36]: Job Listings
          - listitem [ref=e37]:
            - link "Application Studio" [ref=e38] [cursor=pointer]:
              - /url: /agents
              - img [ref=e39]
              - generic [ref=e42]: Application Studio
          - listitem [ref=e43]:
            - link "Story Bank" [ref=e44] [cursor=pointer]:
              - /url: /stories
              - img [ref=e45]
              - generic [ref=e47]: Story Bank
          - listitem [ref=e48]:
            - link "Analytics" [ref=e49] [cursor=pointer]:
              - /url: /analytics
              - img [ref=e50]
              - generic [ref=e52]: Analytics
        - list [ref=e54]:
          - listitem [ref=e55]:
            - link "Users" [ref=e56] [cursor=pointer]:
              - /url: /admin/users
              - img [ref=e57]
              - generic [ref=e62]: Users
          - listitem [ref=e63]:
            - link "Roles" [ref=e64] [cursor=pointer]:
              - /url: /admin/roles
              - img [ref=e65]
              - generic [ref=e67]: Roles
          - listitem [ref=e68]:
            - link "AI Instructions" [ref=e69] [cursor=pointer]:
              - /url: /admin/prompts
              - img [ref=e70]
              - generic [ref=e74]: AI Instructions
          - listitem [ref=e75]:
            - link "Settings" [ref=e76] [cursor=pointer]:
              - /url: /admin/settings
              - img [ref=e77]
              - generic [ref=e78]: Settings
          - listitem [ref=e79]:
            - link "Security" [ref=e80] [cursor=pointer]:
              - /url: /admin/security
              - img [ref=e81]
              - generic [ref=e84]: Security
          - listitem [ref=e85]:
            - link "AI Safety" [ref=e86] [cursor=pointer]:
              - /url: /admin/ai-safety
              - img [ref=e87]
              - generic [ref=e89]: AI Safety
      - generic [ref=e90]:
        - generic [ref=e91]:
          - paragraph [ref=e92]: Admin User
          - paragraph [ref=e93]: Super Admin
        - button "Sign out" [ref=e94] [cursor=pointer]:
          - img [ref=e95]
          - generic [ref=e98]: Sign out
        - button [ref=e99] [cursor=pointer]:
          - img [ref=e100]
    - generic [ref=e102]:
      - banner [ref=e103]:
        - navigation "Breadcrumb" [ref=e104]:
          - link [ref=e105] [cursor=pointer]:
            - /url: /command-center
            - img [ref=e106]
          - generic [ref=e109]:
            - img [ref=e110]
            - link "Admin" [ref=e112] [cursor=pointer]:
              - /url: /admin
          - generic [ref=e113]:
            - img [ref=e114]
            - generic [ref=e116]: Prompts
        - button "Search... ⌘K" [ref=e117] [cursor=pointer]:
          - img [ref=e118]
          - generic [ref=e121]: Search...
          - generic: ⌘K
        - button "Notifications" [ref=e123] [cursor=pointer]:
          - img [ref=e124]
        - button "Toggle theme" [ref=e127] [cursor=pointer]:
          - img [ref=e128]
          - generic [ref=e130]: Toggle theme
      - main [ref=e131]:
        - generic [ref=e132]:
          - generic [ref=e133]:
            - heading "AI Instructions" [level=1] [ref=e134]
            - paragraph [ref=e135]: Manage AI agent system prompts. Edit, test, and publish without redeploying.
          - generic [ref=e136]:
            - button "All Instructions 20 20 published" [ref=e137] [cursor=pointer]:
              - generic [ref=e138]:
                - img [ref=e139]
                - generic [ref=e142]: All Instructions
              - paragraph [ref=e143]: "20"
              - generic [ref=e145]: 20 published
            - button "achievement amplifier 1" [ref=e146] [cursor=pointer]:
              - generic [ref=e147]:
                - img [ref=e149]
                - generic [ref=e152]: achievement amplifier
              - paragraph [ref=e153]: "1"
            - button "ageism shield 1" [ref=e154] [cursor=pointer]:
              - generic [ref=e155]:
                - img [ref=e157]
                - generic [ref=e160]: ageism shield
              - paragraph [ref=e161]: "1"
            - button "ats predictor 1" [ref=e162] [cursor=pointer]:
              - generic [ref=e163]:
                - img [ref=e165]
                - generic [ref=e168]: ats predictor
              - paragraph [ref=e169]: "1"
            - button "brand advisor 1" [ref=e170] [cursor=pointer]:
              - generic [ref=e171]:
                - img [ref=e173]
                - generic [ref=e176]: brand advisor
              - paragraph [ref=e177]: "1"
            - button "coach 1" [ref=e178] [cursor=pointer]:
              - generic [ref=e179]:
                - img [ref=e181]
                - generic [ref=e184]: coach
              - paragraph [ref=e185]: "1"
            - button "coordinator 1" [ref=e186] [cursor=pointer]:
              - generic [ref=e187]:
                - img [ref=e189]
                - generic [ref=e192]: coordinator
              - paragraph [ref=e193]: "1"
            - button "experience enhancer 1" [ref=e194] [cursor=pointer]:
              - generic [ref=e195]:
                - img [ref=e197]
                - generic [ref=e199]: experience enhancer
              - paragraph [ref=e200]: "1"
            - button "hiring manager sim 1" [ref=e201] [cursor=pointer]:
              - generic [ref=e202]:
                - img [ref=e204]
                - generic [ref=e207]: hiring manager sim
              - paragraph [ref=e208]: "1"
            - button "interview verdict 1" [ref=e209] [cursor=pointer]:
              - generic [ref=e210]:
                - img [ref=e212]
                - generic [ref=e215]: interview verdict
              - paragraph [ref=e216]: "1"
            - button "jarvis 3" [ref=e217] [cursor=pointer]:
              - generic [ref=e218]:
                - img [ref=e220]
                - generic [ref=e223]: jarvis
              - paragraph [ref=e224]: "3"
            - button "ninety day plan 1" [ref=e225] [cursor=pointer]:
              - generic [ref=e226]:
                - img [ref=e228]
                - generic [ref=e231]: ninety day plan
              - paragraph [ref=e232]: "1"
            - button "outreach drafter 1" [ref=e233] [cursor=pointer]:
              - generic [ref=e234]:
                - img [ref=e236]
                - generic [ref=e239]: outreach drafter
              - paragraph [ref=e240]: "1"
            - button "overqualification shield 1" [ref=e241] [cursor=pointer]:
              - generic [ref=e242]:
                - img [ref=e244]
                - generic [ref=e247]: overqualification shield
              - paragraph [ref=e248]: "1"
            - button "scout 1" [ref=e249] [cursor=pointer]:
              - generic [ref=e250]:
                - img [ref=e252]
                - generic [ref=e255]: scout
              - paragraph [ref=e256]: "1"
            - button "story interviewer 1" [ref=e257] [cursor=pointer]:
              - generic [ref=e258]:
                - img [ref=e260]
                - generic [ref=e262]: story interviewer
              - paragraph [ref=e263]: "1"
            - button "strategist 1" [ref=e264] [cursor=pointer]:
              - generic [ref=e265]:
                - img [ref=e267]
                - generic [ref=e271]: strategist
              - paragraph [ref=e272]: "1"
            - button "tailor 1" [ref=e273] [cursor=pointer]:
              - generic [ref=e274]:
                - img [ref=e276]
                - generic [ref=e282]: tailor
              - paragraph [ref=e283]: "1"
            - button "talking points 1" [ref=e284] [cursor=pointer]:
              - generic [ref=e285]:
                - img [ref=e287]
                - generic [ref=e290]: talking points
              - paragraph [ref=e291]: "1"
          - generic [ref=e292]:
            - img [ref=e293]
            - textbox "Search instructions..." [ref=e296]
          - generic [ref=e297]:
            - generic [ref=e298]:
              - generic [ref=e299]:
                - generic [ref=e300]:
                  - img [ref=e302]
                  - generic [ref=e305]:
                    - heading "Achievement Amplifier System Prompt" [level=3] [ref=e306]
                    - paragraph [ref=e307]: achievement-amplifier-system
                - generic [ref=e308]:
                  - button "Edit prompt" [ref=e309] [cursor=pointer]:
                    - img [ref=e310]
                  - button "Version history" [ref=e313] [cursor=pointer]:
                    - img [ref=e314]
              - paragraph [ref=e318]: System prompt for the Achievement Amplifier -- bullet point impact maximization
              - generic [ref=e319]:
                - generic [ref=e320]:
                  - img [ref=e321]
                  - generic [ref=e324]: Published
                - generic [ref=e325]: Standard
                - generic [ref=e326]: v1 · 1 day ago
            - generic [ref=e327]:
              - generic [ref=e328]:
                - generic [ref=e329]:
                  - img [ref=e331]
                  - generic [ref=e334]:
                    - heading "Ageism Shield System Prompt" [level=3] [ref=e335]
                    - paragraph [ref=e336]: ageism-shield-system
                - generic [ref=e337]:
                  - button "Edit prompt" [ref=e338] [cursor=pointer]:
                    - img [ref=e339]
                  - button "Version history" [ref=e342] [cursor=pointer]:
                    - img [ref=e343]
              - paragraph [ref=e347]: System prompt for the Ageism Shield -- age signal detection and resume scrubbing
              - generic [ref=e348]:
                - generic [ref=e349]:
                  - img [ref=e350]
                  - generic [ref=e353]: Published
                - generic [ref=e354]: Standard
                - generic [ref=e355]: v1 · 1 day ago
            - generic [ref=e356]:
              - generic [ref=e357]:
                - generic [ref=e358]:
                  - img [ref=e360]
                  - generic [ref=e363]:
                    - heading "ATS Score Predictor System Prompt" [level=3] [ref=e364]
                    - paragraph [ref=e365]: ats-predictor-system
                - generic [ref=e366]:
                  - button "Edit prompt" [ref=e367] [cursor=pointer]:
                    - img [ref=e368]
                  - button "Version history" [ref=e371] [cursor=pointer]:
                    - img [ref=e372]
              - paragraph [ref=e376]: System prompt for the ATS Score Predictor -- ATS simulation and keyword scoring
              - generic [ref=e377]:
                - generic [ref=e378]:
                  - img [ref=e379]
                  - generic [ref=e382]: Published
                - generic [ref=e383]: Standard
                - generic [ref=e384]: v1 · 1 day ago
            - generic [ref=e385]:
              - generic [ref=e386]:
                - generic [ref=e387]:
                  - img [ref=e389]
                  - generic [ref=e392]:
                    - heading "Brand Advisor System Prompt" [level=3] [ref=e393]
                    - paragraph [ref=e394]: brand-advisor-system
                - generic [ref=e395]:
                  - button "Edit prompt" [ref=e396] [cursor=pointer]:
                    - img [ref=e397]
                  - button "Version history" [ref=e400] [cursor=pointer]:
                    - img [ref=e401]
              - paragraph [ref=e405]: System prompt for the Brand Advisor agent -- personal branding
              - generic [ref=e406]:
                - generic [ref=e407]:
                  - img [ref=e408]
                  - generic [ref=e411]: Published
                - generic [ref=e412]: Standard
                - generic [ref=e413]: v2 · 3 days ago
            - generic [ref=e414]:
              - generic [ref=e415]:
                - generic [ref=e416]:
                  - img [ref=e418]
                  - generic [ref=e421]:
                    - heading "Coach System Prompt" [level=3] [ref=e422]
                    - paragraph [ref=e423]: coach-system
                - generic [ref=e424]:
                  - button "Edit prompt" [ref=e425] [cursor=pointer]:
                    - img [ref=e426]
                  - button "Version history" [ref=e429] [cursor=pointer]:
                    - img [ref=e430]
              - paragraph [ref=e434]: System prompt for the Coach agent -- interview preparation
              - generic [ref=e435]:
                - generic [ref=e436]:
                  - img [ref=e437]
                  - generic [ref=e440]: Published
                - generic [ref=e441]: Standard
                - generic [ref=e442]: v2 · 3 days ago
            - generic [ref=e443]:
              - generic [ref=e444]:
                - generic [ref=e445]:
                  - img [ref=e447]
                  - generic [ref=e450]:
                    - heading "Coordinator System Prompt" [level=3] [ref=e451]
                    - paragraph [ref=e452]: coordinator-system
                - generic [ref=e453]:
                  - button "Edit prompt" [ref=e454] [cursor=pointer]:
                    - img [ref=e455]
                  - button "Version history" [ref=e458] [cursor=pointer]:
                    - img [ref=e459]
              - paragraph [ref=e463]: System prompt for the Coordinator agent -- application pipeline management
              - generic [ref=e464]:
                - generic [ref=e465]:
                  - img [ref=e466]
                  - generic [ref=e469]: Published
                - generic [ref=e470]: Light
                - generic [ref=e471]: v2 · 3 days ago
            - generic [ref=e472]:
              - generic [ref=e473]:
                - generic [ref=e474]:
                  - img [ref=e476]
                  - generic [ref=e478]:
                    - heading "Experience Enhancer System Prompt" [level=3] [ref=e479]
                    - paragraph [ref=e480]: experience-enhancer-system
                - generic [ref=e481]:
                  - button "Edit prompt" [ref=e482] [cursor=pointer]:
                    - img [ref=e483]
                  - button "Version history" [ref=e486] [cursor=pointer]:
                    - img [ref=e487]
              - paragraph [ref=e491]: System prompt for the Experience Enhancer agent -- helps improve work experience descriptions
              - generic [ref=e492]:
                - generic [ref=e493]:
                  - img [ref=e494]
                  - generic [ref=e497]: Published
                - generic [ref=e498]: Standard
                - generic [ref=e499]: v2 · 3 days ago
            - generic [ref=e500]:
              - generic [ref=e501]:
                - generic [ref=e502]:
                  - img [ref=e504]
                  - generic [ref=e507]:
                    - heading "Hiring Manager Simulator System Prompt" [level=3] [ref=e508]
                    - paragraph [ref=e509]: hiring-manager-sim-system
                - generic [ref=e510]:
                  - button "Edit prompt" [ref=e511] [cursor=pointer]:
                    - img [ref=e512]
                  - button "Version history" [ref=e515] [cursor=pointer]:
                    - img [ref=e516]
              - paragraph [ref=e520]: System prompt for the Hiring Manager Simulator -- resume evaluation from HM perspective
              - generic [ref=e521]:
                - generic [ref=e522]:
                  - img [ref=e523]
                  - generic [ref=e526]: Published
                - generic [ref=e527]: Standard
                - generic [ref=e528]: v1 · 1 day ago
            - generic [ref=e529]:
              - generic [ref=e530]:
                - generic [ref=e531]:
                  - img [ref=e533]
                  - generic [ref=e536]:
                    - heading "Interview Verdict System Prompt" [level=3] [ref=e537]
                    - paragraph [ref=e538]: interview-verdict-system
                - generic [ref=e539]:
                  - button "Edit prompt" [ref=e540] [cursor=pointer]:
                    - img [ref=e541]
                  - button "Version history" [ref=e544] [cursor=pointer]:
                    - img [ref=e545]
              - paragraph [ref=e549]: System prompt for the Interview Verdict agent -- synthesized likelihood assessment
              - generic [ref=e550]:
                - generic [ref=e551]:
                  - img [ref=e552]
                  - generic [ref=e555]: Published
                - generic [ref=e556]: Standard
                - generic [ref=e557]: v1 · 1 day ago
            - generic [ref=e558]:
              - generic [ref=e559]:
                - generic [ref=e560]:
                  - img [ref=e562]
                  - generic [ref=e565]:
                    - heading "JARVIS Note Parser" [level=3] [ref=e566]
                    - paragraph [ref=e567]: jarvis-note-parser
                - generic [ref=e568]:
                  - button "Edit prompt" [ref=e569] [cursor=pointer]:
                    - img [ref=e570]
                  - button "Version history" [ref=e573] [cursor=pointer]:
                    - img [ref=e574]
              - paragraph [ref=e578]: System prompt for extracting structured data from quick recruiter/interview notes
              - generic [ref=e579]:
                - generic [ref=e580]:
                  - img [ref=e581]
                  - generic [ref=e584]: Published
                - generic [ref=e585]: Light
                - generic [ref=e586]: v1 · 7 hours ago
            - generic [ref=e587]:
              - generic [ref=e588]:
                - generic [ref=e589]:
                  - img [ref=e591]
                  - generic [ref=e594]:
                    - heading "JARVIS Shift Gears Briefing" [level=3] [ref=e595]
                    - paragraph [ref=e596]: jarvis-shift-gears
                - generic [ref=e597]:
                  - button "Edit prompt" [ref=e598] [cursor=pointer]:
                    - img [ref=e599]
                  - button "Version history" [ref=e602] [cursor=pointer]:
                    - img [ref=e603]
              - paragraph [ref=e607]: System prompt for generating a 2-minute pre-interview mental reset briefing
              - generic [ref=e608]:
                - generic [ref=e609]:
                  - img [ref=e610]
                  - generic [ref=e613]: Published
                - generic [ref=e614]: Heavy
                - generic [ref=e615]: v1 · 7 hours ago
            - generic [ref=e616]:
              - generic [ref=e617]:
                - generic [ref=e618]:
                  - img [ref=e620]
                  - generic [ref=e623]:
                    - heading "JARVIS Task Extractor" [level=3] [ref=e624]
                    - paragraph [ref=e625]: jarvis-task-extractor
                - generic [ref=e626]:
                  - button "Edit prompt" [ref=e627] [cursor=pointer]:
                    - img [ref=e628]
                  - button "Version history" [ref=e631] [cursor=pointer]:
                    - img [ref=e632]
              - paragraph [ref=e636]: Analyzes quick capture notes and extracts actionable tasks with smart due dates
              - generic [ref=e637]:
                - generic [ref=e638]:
                  - img [ref=e639]
                  - generic [ref=e642]: Published
                - generic [ref=e643]: Light
                - generic [ref=e644]: v1 · 23 minutes ago
            - generic [ref=e645]:
              - generic [ref=e646]:
                - generic [ref=e647]:
                  - img [ref=e649]
                  - generic [ref=e652]:
                    - heading "90-Day Plan Generator System Prompt" [level=3] [ref=e653]
                    - paragraph [ref=e654]: ninety-day-plan-system
                - generic [ref=e655]:
                  - button "Edit prompt" [ref=e656] [cursor=pointer]:
                    - img [ref=e657]
                  - button "Version history" [ref=e660] [cursor=pointer]:
                    - img [ref=e661]
              - paragraph [ref=e665]: System prompt for the 90-Day Plan Generator -- strategic onboarding plan
              - generic [ref=e666]:
                - generic [ref=e667]:
                  - img [ref=e668]
                  - generic [ref=e671]: Published
                - generic [ref=e672]: Standard
                - generic [ref=e673]: v1 · 1 day ago
            - generic [ref=e674]:
              - generic [ref=e675]:
                - generic [ref=e676]:
                  - img [ref=e678]
                  - generic [ref=e681]:
                    - heading "Direct Outreach Drafter System Prompt" [level=3] [ref=e682]
                    - paragraph [ref=e683]: outreach-drafter-system
                - generic [ref=e684]:
                  - button "Edit prompt" [ref=e685] [cursor=pointer]:
                    - img [ref=e686]
                  - button "Version history" [ref=e689] [cursor=pointer]:
                    - img [ref=e690]
              - paragraph [ref=e694]: System prompt for the Direct Outreach Drafter -- hiring manager messaging
              - generic [ref=e695]:
                - generic [ref=e696]:
                  - img [ref=e697]
                  - generic [ref=e700]: Published
                - generic [ref=e701]: Standard
                - generic [ref=e702]: v1 · 1 day ago
            - generic [ref=e703]:
              - generic [ref=e704]:
                - generic [ref=e705]:
                  - img [ref=e707]
                  - generic [ref=e710]:
                    - heading "Overqualification Shield System Prompt" [level=3] [ref=e711]
                    - paragraph [ref=e712]: overqualification-shield-system
                - generic [ref=e713]:
                  - button "Edit prompt" [ref=e714] [cursor=pointer]:
                    - img [ref=e715]
                  - button "Version history" [ref=e718] [cursor=pointer]:
                    - img [ref=e719]
              - paragraph [ref=e723]: System prompt for the Overqualification Shield agent -- right-sizes resumes for senior candidates
              - generic [ref=e724]:
                - generic [ref=e725]:
                  - img [ref=e726]
                  - generic [ref=e729]: Published
                - generic [ref=e730]: Standard
                - generic [ref=e731]: v1 · 1 day ago
            - generic [ref=e732]:
              - generic [ref=e733]:
                - generic [ref=e734]:
                  - img [ref=e736]
                  - generic [ref=e739]:
                    - heading "Scout System Prompt" [level=3] [ref=e740]
                    - paragraph [ref=e741]: scout-system
                - generic [ref=e742]:
                  - button "Edit prompt" [ref=e743] [cursor=pointer]:
                    - img [ref=e744]
                  - button "Version history" [ref=e747] [cursor=pointer]:
                    - img [ref=e748]
              - paragraph [ref=e752]: System prompt for the Scout agent -- job analysis and matching
              - generic [ref=e753]:
                - generic [ref=e754]:
                  - img [ref=e755]
                  - generic [ref=e758]: Published
                - generic [ref=e759]: Standard
                - generic [ref=e760]: v2 · 3 days ago
            - generic [ref=e761]:
              - generic [ref=e762]:
                - generic [ref=e763]:
                  - img [ref=e765]
                  - generic [ref=e767]:
                    - heading "Story Interviewer System Prompt" [level=3] [ref=e768]
                    - paragraph [ref=e769]: story-interviewer-system
                - generic [ref=e770]:
                  - button "Edit prompt" [ref=e771] [cursor=pointer]:
                    - img [ref=e772]
                  - button "Version history" [ref=e775] [cursor=pointer]:
                    - img [ref=e776]
              - paragraph [ref=e780]: System prompt for the Story Interviewer -- AI-guided story refinement
              - generic [ref=e781]:
                - generic [ref=e782]:
                  - img [ref=e783]
                  - generic [ref=e786]: Published
                - generic [ref=e787]: Heavy
                - generic [ref=e788]: v1 · 3 days ago
            - generic [ref=e789]:
              - generic [ref=e790]:
                - generic [ref=e791]:
                  - img [ref=e793]
                  - generic [ref=e797]:
                    - heading "Strategist System Prompt" [level=3] [ref=e798]
                    - paragraph [ref=e799]: strategist-system
                - generic [ref=e800]:
                  - button "Edit prompt" [ref=e801] [cursor=pointer]:
                    - img [ref=e802]
                  - button "Version history" [ref=e805] [cursor=pointer]:
                    - img [ref=e806]
              - paragraph [ref=e810]: System prompt for the Strategist agent -- career planning and negotiation
              - generic [ref=e811]:
                - generic [ref=e812]:
                  - img [ref=e813]
                  - generic [ref=e816]: Published
                - generic [ref=e817]: Heavy
                - generic [ref=e818]: v2 · 3 days ago
            - generic [ref=e819]:
              - generic [ref=e820]:
                - generic [ref=e821]:
                  - img [ref=e823]
                  - generic [ref=e829]:
                    - heading "Tailor System Prompt" [level=3] [ref=e830]
                    - paragraph [ref=e831]: tailor-system
                - generic [ref=e832]:
                  - button "Edit prompt" [ref=e833] [cursor=pointer]:
                    - img [ref=e834]
                  - button "Version history" [ref=e837] [cursor=pointer]:
                    - img [ref=e838]
              - paragraph [ref=e842]: System prompt for the Tailor agent -- resume and cover letter optimization
              - generic [ref=e843]:
                - generic [ref=e844]:
                  - img [ref=e845]
                  - generic [ref=e848]: Published
                - generic [ref=e849]: Heavy
                - generic [ref=e850]: v2 · 3 days ago
            - generic [ref=e851]:
              - generic [ref=e852]:
                - generic [ref=e853]:
                  - img [ref=e855]
                  - generic [ref=e858]:
                    - heading "Talking Points System Prompt" [level=3] [ref=e859]
                    - paragraph [ref=e860]: talking-points-system
                - generic [ref=e861]:
                  - button "Edit prompt" [ref=e862] [cursor=pointer]:
                    - img [ref=e863]
                  - button "Version history" [ref=e866] [cursor=pointer]:
                    - img [ref=e867]
              - paragraph [ref=e871]: System prompt for the Talking Points agent -- interview story generation
              - generic [ref=e872]:
                - generic [ref=e873]:
                  - img [ref=e874]
                  - generic [ref=e877]: Published
                - generic [ref=e878]: Heavy
                - generic [ref=e879]: v1 · 3 days ago
  - alert [ref=e880]
```

# Test source

```ts
  1  | import { test } from "@playwright/test";
  2  | import { loginAsAdmin, loginAsUser } from "./helpers";
  3  | 
  4  | const SCREENSHOT_DIR = "../.try-it/screenshots";
  5  | 
  6  | const ADMIN_PAGES = [
  7  |   { name: "command-center", path: "/command-center" },
  8  |   { name: "dashboard", path: "/dashboard" },
  9  |   { name: "profile", path: "/profile" },
  10 |   { name: "jobs", path: "/jobs" },
  11 |   { name: "resumes", path: "/resumes" },
  12 |   { name: "agents", path: "/agents" },
  13 |   { name: "stories", path: "/stories" },
  14 |   { name: "analytics", path: "/analytics" },
  15 |   { name: "admin-prompts", path: "/admin/prompts" },
  16 | ];
  17 | 
  18 | const USER_PAGES = [
  19 |   { name: "command-center", path: "/command-center" },
  20 |   { name: "dashboard", path: "/dashboard" },
  21 |   { name: "profile", path: "/profile" },
  22 |   { name: "jobs", path: "/jobs" },
  23 |   { name: "resumes", path: "/resumes" },
  24 |   { name: "agents", path: "/agents" },
  25 |   { name: "stories", path: "/stories" },
  26 |   { name: "analytics", path: "/analytics" },
  27 | ];
  28 | 
  29 | test.describe("Screenshots - Admin", () => {
  30 |   test.beforeEach(async ({ page }) => {
  31 |     await loginAsAdmin(page);
  32 |   });
  33 | 
  34 |   for (const pg of ADMIN_PAGES) {
  35 |     test(`admin_${pg.name}`, async ({ page }) => {
  36 |       await page.goto(pg.path);
> 37 |       await page.waitForLoadState("networkidle");
     |                  ^ Error: page.waitForLoadState: Test timeout of 30000ms exceeded.
  38 |       await page.waitForTimeout(1000);
  39 |       await page.screenshot({ path: `${SCREENSHOT_DIR}/admin_${pg.name}.png`, fullPage: true });
  40 |     });
  41 |   }
  42 | });
  43 | 
  44 | test.describe("Screenshots - User", () => {
  45 |   test.beforeEach(async ({ page }) => {
  46 |     await loginAsUser(page);
  47 |   });
  48 | 
  49 |   for (const pg of USER_PAGES) {
  50 |     test(`user_${pg.name}`, async ({ page }) => {
  51 |       await page.goto(pg.path);
  52 |       await page.waitForLoadState("networkidle");
  53 |       await page.waitForTimeout(1000);
  54 |       await page.screenshot({ path: `${SCREENSHOT_DIR}/user_${pg.name}.png`, fullPage: true });
  55 |     });
  56 |   }
  57 | });
  58 | 
```