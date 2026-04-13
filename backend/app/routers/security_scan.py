"""Security scanner: audits app configuration for common vulnerabilities."""

import logging
import os

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import settings
from app.middleware.permissions import require_permission
from app.schemas.auth import UserInfo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/security", tags=["security"])


class Finding(BaseModel):
    id: str
    category: str
    severity: str  # critical, high, medium, low, info
    title: str
    description: str
    remediation: str | None = None
    passed: bool


class ScanResult(BaseModel):
    findings: list[Finding]
    total_checks: int
    passed: int
    failed: int
    score: int  # 0-100


def _check_jwt_secret() -> Finding:
    secret = settings.JWT_SECRET
    if secret == "change-me-in-production":
        return Finding(
            id="SEC-001",
            category="Authentication",
            severity="critical",
            title="Default JWT secret in use",
            description="JWT_SECRET is set to the default value. Tokens can be forged by anyone who reads the source code.",
            remediation="Set JWT_SECRET to a strong random value (32+ characters) in .env",
            passed=False,
        )
    if len(secret) < 16:
        return Finding(
            id="SEC-001",
            category="Authentication",
            severity="high",
            title="Weak JWT secret",
            description=f"JWT_SECRET is only {len(secret)} characters. Use at least 32 characters.",
            remediation="Set JWT_SECRET to a longer random string in .env",
            passed=False,
        )
    return Finding(
        id="SEC-001",
        category="Authentication",
        severity="info",
        title="JWT secret configured",
        description="JWT_SECRET is set to a custom value with adequate length.",
        passed=True,
    )


def _check_enforce_secrets() -> Finding:
    if not settings.ENFORCE_SECRETS:
        return Finding(
            id="SEC-002",
            category="Configuration",
            severity="medium",
            title="Secret enforcement disabled",
            description="ENFORCE_SECRETS is False. The app will start with default/weak secrets.",
            remediation="Set ENFORCE_SECRETS=true in .env for production deployments",
            passed=False,
        )
    return Finding(
        id="SEC-002",
        category="Configuration",
        severity="info",
        title="Secret enforcement enabled",
        description="ENFORCE_SECRETS is True. The app requires strong secrets to start.",
        passed=True,
    )


def _check_cors_config() -> Finding:
    origin = settings.FRONTEND_URL
    if origin == "*" or not origin:
        return Finding(
            id="SEC-003",
            category="Network",
            severity="high",
            title="CORS allows all origins",
            description="FRONTEND_URL is wildcard or empty. Any website can make authenticated requests.",
            remediation="Set FRONTEND_URL to the exact frontend origin (e.g. https://app.example.com)",
            passed=False,
        )
    if "localhost" in origin or "127.0.0.1" in origin:
        return Finding(
            id="SEC-003",
            category="Network",
            severity="low",
            title="CORS allows localhost",
            description=f"FRONTEND_URL is {origin}. Acceptable for development, not for production.",
            remediation="Update FRONTEND_URL to your production domain before deploying",
            passed=True,
        )
    return Finding(
        id="SEC-003",
        category="Network",
        severity="info",
        title="CORS configured",
        description=f"FRONTEND_URL is set to {origin}.",
        passed=True,
    )


def _check_oidc_config() -> Finding:
    issuer = settings.OIDC_ISSUER_URL
    if "mock-oidc" in issuer:
        return Finding(
            id="SEC-004",
            category="Authentication",
            severity="medium",
            title="Mock OIDC provider in use",
            description="OIDC_ISSUER_URL points to mock-oidc. This is for development only.",
            remediation="Configure a real OIDC provider (Azure AD, Okta, etc.) for production",
            passed=False,
        )
    if not issuer.startswith("https://"):
        return Finding(
            id="SEC-004",
            category="Authentication",
            severity="high",
            title="OIDC issuer not using HTTPS",
            description=f"OIDC_ISSUER_URL ({issuer}) is not HTTPS. Tokens can be intercepted.",
            remediation="Use an HTTPS OIDC issuer URL",
            passed=False,
        )
    return Finding(
        id="SEC-004",
        category="Authentication",
        severity="info",
        title="OIDC provider configured",
        description=f"OIDC issuer is {issuer}.",
        passed=True,
    )


def _check_database_url() -> Finding:
    db_url = settings.DATABASE_URL
    if "career-lens:career-lens" in db_url:
        return Finding(
            id="SEC-005",
            category="Database",
            severity="high",
            title="Default database credentials",
            description="DATABASE_URL uses default username/password (career-lens:career-lens).",
            remediation="Use strong, unique database credentials in production",
            passed=False,
        )
    return Finding(
        id="SEC-005",
        category="Database",
        severity="info",
        title="Database credentials customized",
        description="Database connection uses non-default credentials.",
        passed=True,
    )


def _check_ai_api_keys() -> Finding:
    provider = settings.AI_PROVIDER.lower()
    if provider == "anthropic_foundry":
        has_key = bool(settings.AZURE_AI_FOUNDRY_API_KEY)
        has_endpoint = bool(settings.AZURE_AI_FOUNDRY_ENDPOINT)
        if not has_endpoint:
            return Finding(
                id="SEC-006",
                category="AI Provider",
                severity="medium",
                title="AI Foundry endpoint not configured",
                description="AZURE_AI_FOUNDRY_ENDPOINT is empty. AI features will not work.",
                remediation="Set the endpoint in .env or Admin Settings",
                passed=False,
            )
    elif provider == "anthropic":
        if not settings.ANTHROPIC_API_KEY:
            return Finding(
                id="SEC-006",
                category="AI Provider",
                severity="medium",
                title="Anthropic API key missing",
                description="ANTHROPIC_API_KEY is empty. AI features will not work.",
                remediation="Set the API key in .env or Admin Settings",
                passed=False,
            )
    elif provider == "openai":
        if not settings.OPENAI_API_KEY:
            return Finding(
                id="SEC-006",
                category="AI Provider",
                severity="medium",
                title="OpenAI API key missing",
                description="OPENAI_API_KEY is empty. AI features will not work.",
                remediation="Set the API key in .env or Admin Settings",
                passed=False,
            )
    return Finding(
        id="SEC-006",
        category="AI Provider",
        severity="info",
        title="AI provider credentials present",
        description=f"Active provider ({provider}) has credentials configured.",
        passed=True,
    )


def _check_debug_mode() -> Finding:
    debug = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")
    if debug:
        return Finding(
            id="SEC-007",
            category="Configuration",
            severity="medium",
            title="Debug mode enabled",
            description="DEBUG environment variable is set. May expose stack traces and internal details.",
            remediation="Unset DEBUG in production",
            passed=False,
        )
    return Finding(
        id="SEC-007",
        category="Configuration",
        severity="info",
        title="Debug mode disabled",
        description="DEBUG is not enabled.",
        passed=True,
    )


def _check_https_backend() -> Finding:
    url = settings.BACKEND_URL
    if url.startswith("http://") and "localhost" not in url and "127.0.0.1" not in url:
        return Finding(
            id="SEC-008",
            category="Network",
            severity="high",
            title="Backend URL uses HTTP",
            description=f"BACKEND_URL ({url}) is not HTTPS. API traffic will be unencrypted.",
            remediation="Use HTTPS for the backend URL in production",
            passed=False,
        )
    return Finding(
        id="SEC-008",
        category="Network",
        severity="info",
        title="Backend URL acceptable",
        description=f"BACKEND_URL is {url}.",
        passed=True,
    )


@router.get("/scan", response_model=ScanResult)
async def run_security_scan(
    current_user: UserInfo = Depends(require_permission("app_settings", "view")),
):
    """Run a security configuration audit and return findings."""
    checks = [
        _check_jwt_secret,
        _check_enforce_secrets,
        _check_cors_config,
        _check_oidc_config,
        _check_database_url,
        _check_ai_api_keys,
        _check_debug_mode,
        _check_https_backend,
    ]

    findings = [check() for check in checks]
    total = len(findings)
    passed = sum(1 for f in findings if f.passed)
    failed = total - passed
    score = int((passed / total) * 100) if total > 0 else 0

    return ScanResult(
        findings=findings,
        total_checks=total,
        passed=passed,
        failed=failed,
        score=score,
    )
