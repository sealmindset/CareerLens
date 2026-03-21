"""Shared Azure AD token acquisition via MSAL cache (mounted ~/.azure)."""

import logging
import os

logger = logging.getLogger(__name__)


def get_fresh_az_token() -> str | None:
    """Get a fresh Azure AD token by reading the MSAL token cache from mounted ~/.azure."""
    try:
        import msal
    except ImportError:
        logger.warning("msal package not available")
        return None

    cache_path = os.path.join(
        os.environ.get("AZURE_CONFIG_DIR", os.path.expanduser("~/.azure")),
        "msal_token_cache.json",
    )
    if not os.path.exists(cache_path):
        logger.warning("MSAL token cache not found at %s", cache_path)
        return None

    try:
        cache = msal.SerializableTokenCache()
        with open(cache_path) as f:
            cache.deserialize(f.read())

        app = msal.PublicClientApplication(
            "04b07795-8ddb-461a-bbee-02f9e1bf7b46",
            authority="https://login.microsoftonline.com/organizations",
            token_cache=cache,
        )

        accounts = app.get_accounts()
        if not accounts:
            logger.warning("No accounts found in MSAL token cache")
            return None

        result = app.acquire_token_silent(
            ["https://cognitiveservices.azure.com/.default"],
            account=accounts[0],
        )
        if result and "access_token" in result:
            return result["access_token"]

        logger.warning("MSAL silent token acquisition failed: %s", result.get("error_description", "unknown"))
    except Exception as e:
        logger.warning("MSAL token cache read error: %s", e)
    return None
