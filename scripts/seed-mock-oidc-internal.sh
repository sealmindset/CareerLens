#!/usr/bin/env bash
# =============================================================================
# Seed mock-oidc (internal) -- runs inside Docker network
# =============================================================================
# Called by the mock-oidc-seed service in docker-compose.yml.
# Uses internal network URLs (mock-oidc:10090) instead of localhost.
# =============================================================================

set -euo pipefail

MOCK_OIDC_URL="http://mock-oidc:10090"
CLIENT_ID="mock-oidc-client"
FRONTEND_URL="http://localhost:3300"
MAX_RETRIES=30

# App users (must match database seed oidc_subjects)
USERS='[
  {"sub":"mock-admin","email":"admin@career-lens.local","name":"Admin User"},
  {"sub":"mock-manager","email":"manager@career-lens.local","name":"Manager User"},
  {"sub":"mock-pro","email":"pro@career-lens.local","name":"Pro User"},
  {"sub":"mock-user","email":"user@career-lens.local","name":"Regular User"}
]'

# Wait for mock-oidc
echo "Waiting for mock-oidc..."
RETRY=0
until wget -qO /dev/null "${MOCK_OIDC_URL}/health" 2>/dev/null; do
    RETRY=$((RETRY + 1))
    if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
        echo "ERROR: mock-oidc not healthy after ${MAX_RETRIES} attempts"
        exit 1
    fi
    sleep 2
done
echo "mock-oidc is healthy"

# Register users
echo "$USERS" | python3 -c "
import json, sys, urllib.request, urllib.error

users = json.load(sys.stdin)
base = '${MOCK_OIDC_URL}'

for u in users:
    data = json.dumps(u).encode()
    req = urllib.request.Request(f'{base}/api/users', data=data, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        urllib.request.urlopen(req)
        print(f'  Registered: {u[\"name\"]} ({u[\"sub\"]})')
    except urllib.error.HTTPError as e:
        if e.code == 409:
            print(f'  Already exists: {u[\"name\"]} ({u[\"sub\"]})')
        else:
            print(f'  Failed: {u[\"name\"]} -- HTTP {e.code}')
"

# Set redirect URI
python3 -c "
import json, urllib.request
data = json.dumps({'redirect_uris': ['${FRONTEND_URL}/api/auth/callback']}).encode()
req = urllib.request.Request('${MOCK_OIDC_URL}/api/clients/${CLIENT_ID}/redirect_uris', data=data, headers={'Content-Type': 'application/json'}, method='PUT')
urllib.request.urlopen(req)
print('  Redirect URI set: ${FRONTEND_URL}/api/auth/callback')
"

echo "Mock-oidc seeded successfully"
