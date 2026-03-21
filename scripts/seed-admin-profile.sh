#!/usr/bin/env bash
# =============================================================================
# Seed Admin Profile -- CareerLens
# =============================================================================
# Seeds the mock-admin user's profile (resume, skills, experiences, education)
# into the database. Safe to run multiple times -- deletes existing profile data
# for mock-admin before inserting.
#
# Usage:
#   bash scripts/seed-admin-profile.sh
#
# Prerequisites:
#   - docker compose --profile dev up (database must be running)
#   - Alembic migrations already applied (tables exist)
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ADMIN_OIDC_SUB="mock-admin"
DB_USER="career-lens"
DB_NAME="career-lens"

# Docker compose command for psql
PSQL_CMD="docker compose --profile dev exec -T db psql -U ${DB_USER} -d ${DB_NAME}"

# ---------------------------------------------------------------------------
# Wait for database
# ---------------------------------------------------------------------------
info "Waiting for database..."
for i in $(seq 1 30); do
    if $PSQL_CMD -c "SELECT 1;" > /dev/null 2>&1; then
        break
    fi
    if [ "$i" -eq 30 ]; then
        error "Database did not become ready in time"
        exit 1
    fi
    sleep 1
done
info "Database is ready"

# ---------------------------------------------------------------------------
# Find the admin user ID
# ---------------------------------------------------------------------------
info "Looking up admin user (oidc_subject = '${ADMIN_OIDC_SUB}')..."

ADMIN_USER_ID=$($PSQL_CMD -t -A -c "SELECT id FROM users WHERE oidc_subject = '${ADMIN_OIDC_SUB}';")

if [ -z "$ADMIN_USER_ID" ]; then
    error "Admin user not found. Make sure seed data migration has run."
    exit 1
fi

info "Found admin user: ${ADMIN_USER_ID}"

# ---------------------------------------------------------------------------
# Clean existing profile data for this user
# ---------------------------------------------------------------------------
info "Removing existing profile data for admin user..."

$PSQL_CMD -c "
DELETE FROM profile_skills WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = '${ADMIN_USER_ID}');
DELETE FROM profile_experiences WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = '${ADMIN_USER_ID}');
DELETE FROM profile_educations WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = '${ADMIN_USER_ID}');
DELETE FROM profiles WHERE user_id = '${ADMIN_USER_ID}';
" > /dev/null

# ---------------------------------------------------------------------------
# Insert profile
# ---------------------------------------------------------------------------
info "Creating admin profile..."

# Generate UUID upfront so we can reference it in all subsequent inserts
PROFILE_ID=$($PSQL_CMD -t -A -c "SELECT gen_random_uuid();" | head -1)

$PSQL_CMD -c "
INSERT INTO profiles (id, user_id, headline, summary, raw_resume_text, linkedin_url, created_at, updated_at)
VALUES (
    '${PROFILE_ID}',
    '${ADMIN_USER_ID}',
    'Enterprise AI & Security Architect',
    'A Enterprise AI & Security Architect with a proven track record of transforming security into a strategic business enabler. I don''t just secure systems—I architect security to accelerate business innovation, reduce risk, and drive enterprise-wide trust. From leading Zero Trust cloud transformations to influencing boardroom security decisions, I bring a business-first, security-always mindset that aligns security with organizational growth. My expertise spans security modernization, cloud-first security strategies, and federated security governance, ensuring that security frameworks support scalability, agility, and operational resilience.',
    'Professional Summary
A Enterprise AI & Security Architect with a proven track record of transforming security into a strategic business enabler. I don''t just secure systems—I architect security to accelerate business innovation, reduce risk, and drive enterprise-wide trust. From leading Zero Trust cloud transformations to influencing boardroom security decisions, I bring a business-first, security-always mindset that aligns security with organizational growth. My expertise spans security modernization, cloud-first security strategies, and federated security governance, ensuring that security frameworks support scalability, agility, and operational resilience.
Security Leadership & Transformation Impact
Led Zero Trust Cloud Transformation: Spearheaded a complete shift to Zero Trust security architecture, integrating security automation into cloud infrastructure, reducing misconfigurations by 60%, and accelerating cloud adoption without increasing risk exposure.
Architected Business-Driven Security Investments: Secured board-level buy-in for security investments by demonstrating security''s direct impact on business agility, resulting in a 35% reduction in security bottlenecks across cloud migration projects.
Automated Security Governance & Compliance: Replaced legacy, manual compliance processes with security-as-code principles, improving compliance efficiency by 50% and embedding security into DevSecOps workflows seamlessly.
Key Skills & Expertise
Enterprise Security Strategy & Governance – Designed risk-driven security frameworks that align with business objectives while ensuring robust security postures.
Cloud Security & Zero Trust Implementation – Led secure cloud migrations across AWS, Azure, and GCP, embedding Zero Trust and identity-first security models.
Threat Intelligence & Predictive Security – Leveraged AI-driven security analytics to anticipate and mitigate cyber threats before they escalate.
Security as a Business Driver – Shifted security from a compliance function to an enabler of business growth, securing executive support for long-term security roadmaps.
Security Automation & Architecture as Code – Developed and implemented automated security controls, reducing human error and increasing operational efficiency.
Cross-Functional Leadership & Influence – Worked across engineering, security, and executive leadership teams to embed security into every aspect of technology strategy.
Professional Experience
Enterprise AI & Security Architect | Sleep Number Corp. LLC | 2020 – Present
As the Enterprise AI & Security Architect, I''ve redefined security strategy to support business growth while ensuring risk mitigation at scale. My approach ensures security does not slow down innovation but instead accelerates it through automation and integration with cloud-native technologies.
Security Governance Transformation: Transitioned from a rigid, compliance-heavy security model to a federated, risk-based governance approach, allowing business units to operate securely without unnecessary roadblocks.
Zero Trust & Cloud Modernization: Designed and implemented a Zero Trust cloud architecture, embedding security into development pipelines, reducing misconfiguration risk by 60%.
Automating Security at Scale: Led the development of security-as-code pipelines, allowing for automated compliance checks and real-time risk detection.
Business-First Security Roadmaps: Partnered with finance and operations to align security initiatives with revenue growth, securing \$5M in strategic security investments.
Transformed organizational hesitations into cross-functional buy-in by introducing a formal RFC process for AI initiatives – converting potential blockers into invested contributors and accelerating adoption velocity without requiring needless rework.
Six-time recipient of the IT Champions Award – Sleep Number''s peer-nominated recognition for exception cross-function impact, earning a personal callout from the CEO who remarked that \"Rob should just stay standing for the photos – the only individual honored at that frequency.
Two-time recipient of the Bradley Erickson Award for AI Innovation – Sleep Number''s prestigious recognition for transformative technology leadership, awarded in consecutive years (2024 & 2025) for pioneering secure AI adoption at enterprise.
Designed and published make-it and ship-it Claude Code skills that compress idea-to-working to under 20 minutes by embedding 15+ years of security architecture directly into AI-generated code – enabling any business user to build production -ready applications without sacrificing compliance, scalability, or security.
Principal Security Consultant | NGO Security Solutions LLC | 2014 – 2020
Consulted for Fortune 500 companies, designing and implementing enterprise security strategies that supported large-scale digital transformations. My work focused on balancing security governance with business agility to enable scalable, secure growth.
Enterprise Security Strategy Development: Designed security frameworks that aligned with organizational goals, ensuring security investments drove business value.
Threat & Vulnerability Management: Developed proactive security assessment methodologies that reduced security incidents by 40%.
Security Observability & Incident Response: Integrated security analytics and AI-driven threat intelligence, improving response times and reducing incident detection times by 70%.
Key Achievement: Improved enterprise-wide security resilience by 40%, enabling secure expansion into new markets without increasing risk exposure.
Future Vision for Security Architecture
Enterprise security is evolving beyond traditional defense mechanisms. The next era of security architecture must be predictive, identity-driven, and AI-enhanced. I am focused on designing architectures that integrate machine learning-based threat detection, real-time risk analytics, and adaptive security automation to protect against emerging threats while supporting business innovation. My goal is to embed security deeply within technology ecosystems, ensuring that security is not just reactive but an active driver of digital transformation and operational resilience.
Additional Experience
Held senior security positions focused on developing risk-driven security strategies, leading penetration testing efforts, and overseeing enterprise security policy frameworks to support long-term business resilience.
Education & Certifications
Massachusetts Institute of Technology – Cloud & DevOps

Certifications:
- Certified Information Systems Security Professional (CISSP)
- Lockpath Keylight Certified Consultant
Professional Achievements & Thought Leadership
Transforming Security into a Business Accelerator: Led multiple security transformations that streamlined compliance, increased agility, and reduced security risks while enabling business growth.
C-Level Influence & Security Advocacy: Successfully secured executive and board approval for security investments by linking security strategy to business outcomes.
Thought Leadership in Cybersecurity: Regular contributor to security forums, industry panels, and mentorship programs to shape the next generation of enterprise security leaders.',
    'https://www.linkedin.com/in/robertavance/',
    NOW(),
    NOW()
);
" > /dev/null

info "Created profile: ${PROFILE_ID}"

# ---------------------------------------------------------------------------
# Insert skills
# ---------------------------------------------------------------------------
info "Adding skills..."

$PSQL_CMD -c "
INSERT INTO profile_skills (id, profile_id, skill_name, proficiency_level, years_experience, source, created_at) VALUES
(gen_random_uuid(), '${PROFILE_ID}', 'Enterprise Security Strategy & Governance', 'expert', 11, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Cloud Security', 'expert', 10, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Zero Trust Architecture', 'expert', 8, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Threat Intelligence', 'expert', 10, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'DevSecOps', 'expert', 8, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Security Automation', 'expert', 8, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Security as Code', 'expert', 7, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'AI-driven Security Analytics', 'expert', 6, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Compliance & Risk Management', 'expert', 11, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Incident Response', 'expert', 10, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'AI Integration', 'expert', 5, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Penetration Testing', 'advanced', 9, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'AWS', 'advanced', 8, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Azure', 'advanced', 8, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'GCP', 'advanced', 8, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Cloud DevOps', 'advanced', 7, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Machine Learning Security', 'advanced', 4, 'resume', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Artificial Intelligence', 'intermediate', NULL, 'linkedin', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Machine Learning', 'intermediate', NULL, 'linkedin', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Cloud Architecture', 'intermediate', NULL, 'linkedin', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Enterprise Strategy', 'intermediate', NULL, 'linkedin', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'System Design', 'intermediate', NULL, 'linkedin', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Microservices', 'intermediate', NULL, 'linkedin', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Kubernetes', 'intermediate', NULL, 'linkedin', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Python', 'intermediate', NULL, 'linkedin', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'TypeScript', 'intermediate', NULL, 'linkedin', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'DevOps', 'intermediate', NULL, 'linkedin', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Data Engineering', 'intermediate', NULL, 'linkedin', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Product Strategy', 'intermediate', NULL, 'linkedin', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Team Leadership', 'intermediate', NULL, 'linkedin', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Stakeholder Management', 'intermediate', NULL, 'linkedin', NOW()),
(gen_random_uuid(), '${PROFILE_ID}', 'Agile Methodologies', 'intermediate', NULL, 'linkedin', NOW());
" > /dev/null

info "Added 32 skills"

# ---------------------------------------------------------------------------
# Insert experiences
# ---------------------------------------------------------------------------
info "Adding work experiences..."

$PSQL_CMD -c "
INSERT INTO profile_experiences (id, profile_id, company, title, description, start_date, end_date, is_current, created_at) VALUES
(gen_random_uuid(), '${PROFILE_ID}', 'Sleep Number Corp. LLC', 'Enterprise AI & Security Architect',
'Enterprise AI & Security Architect | Sleep Number Corp.
January 2020 - Present
• Architected a federated security governance framework that accelerated security decisions by 40% while maintaining SOX and PCI-DSS compliance—strategically designed PCI environment boundaries to keep 99.999% of infrastructure out of scope, reducing audit burden, lowering infrastructure costs, and enabling rapid business pivots without compliance friction
• Pioneered AI-powered secure development frameworks that compress deployment cycles from weeks to minutes, embedding 14+ years of security intelligence into automated code generation to accelerate innovation without sacrificing security posture—addressing the same AI code generation challenges that cost Amazon \$50M in their failed CodeWhisperer initiative
• Designed Zero Trust architecture across hybrid cloud infrastructure (AWS, Azure, GCP), embedding security-as-code into CI/CD pipelines to eliminate 60% of misconfigurations and accelerate secure deployments by 35%
• Personally conducted comprehensive penetration testing across mobile applications and backend systems to validate security architecture, while separately orchestrating enterprise-scale security assessments with boutique firms and Verizon to ensure continuous security validation
• Recognized with six IT Champions Awards and consecutive Bradley Erickson Awards for AI Innovation (2024, 2025) for delivering transformative solutions at the intersection of security, cloud, and AI',
'2020-01-01', NULL, TRUE, NOW()),

(gen_random_uuid(), '${PROFILE_ID}', 'NGO Security Solutions LLC', 'Principal Security Consultant',
'Principal Security Consultant | NGO Security Solutions LLC
January 2014 - January 2020

• Architected enterprise security strategies for 15+ Fortune 500 clients across financial services, healthcare, and technology sectors, supporting digital transformations valued at \$2B+ and protecting 50M+ users—establishing foundational frameworks and methodologies now applied at enterprise scale
• Pioneered proactive security assessment methodology adopted by 8 client organizations as their security baseline, reducing security incidents by 40% and establishing repeatable patterns for security-as-business-enabler transformation
• Engineered AI-driven threat intelligence integration reducing mean time to detect (MTTD) by 70% and incident response times from 48 hours to 14 hours, developing the analytics-first approach that drives modern security operations
• Transformed security posture for organizations with 10,000+ employees from reactive cost centers to strategic business enablers, enabling secure expansion into 12 new markets and proving security''s role in revenue growth
• Led C-suite security advisory engagements influencing \$50M+ in security investments, developing the business-aligned communication and stakeholder management approach essential for enterprise security leadership',
'2014-01-01', '2020-01-01', FALSE, NOW());
" > /dev/null

info "Added 2 experiences"

# ---------------------------------------------------------------------------
# Insert education
# ---------------------------------------------------------------------------
info "Adding education..."

$PSQL_CMD -c "
INSERT INTO profile_educations (id, profile_id, institution, degree, field_of_study, graduation_date, created_at) VALUES
(gen_random_uuid(), '${PROFILE_ID}', 'Massachusetts Institute of Technology', NULL, 'Cloud & DevOps', NULL, NOW());
" > /dev/null

info "Added 1 education record"

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------
SKILL_COUNT=$($PSQL_CMD -t -A -c "SELECT COUNT(*) FROM profile_skills WHERE profile_id = '${PROFILE_ID}';")
EXP_COUNT=$($PSQL_CMD -t -A -c "SELECT COUNT(*) FROM profile_experiences WHERE profile_id = '${PROFILE_ID}';")
EDU_COUNT=$($PSQL_CMD -t -A -c "SELECT COUNT(*) FROM profile_educations WHERE profile_id = '${PROFILE_ID}';")
RESUME_LEN=$($PSQL_CMD -t -A -c "SELECT LENGTH(raw_resume_text) FROM profiles WHERE id = '${PROFILE_ID}';")

echo ""
info "=== Admin Profile Seed Complete ==="
info "Profile ID:    ${PROFILE_ID}"
info "Skills:        ${SKILL_COUNT}"
info "Experiences:   ${EXP_COUNT}"
info "Education:     ${EDU_COUNT}"
info "Resume length: ${RESUME_LEN} chars"
echo ""
info "Done! The admin user's profile is ready."
