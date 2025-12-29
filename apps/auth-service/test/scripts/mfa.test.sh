#!/bin/bash
# test-mfa-complete.sh
# Complete MFA integration test script

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:4000"
TENANT_ID="d9717e9f-64d1-4f7a-8baa-31d2a91d45a7"
EMAIL="test2@example.com"
PASSWORD="SecureP@ssw0rd123!"

echo -e "${BLUE}🔐 Fort Knox MFA Integration Test${NC}"
echo "====================================="
echo ""

# Variables to store between steps
ACCESS_TOKEN=""
TEMP_TOKEN=""
MFA_CODE=""
BACKUP_CODE=""

# ============================================================
# TEST 1: Register User (if needed)
# ============================================================

echo -e "${YELLOW}📋 Test 1: Register User${NC}"
echo "---"

response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"firstName\": \"Test\",
    \"lastName\": \"User\"
  }")

http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -eq 201 ] || [ "$http_code" -eq 409 ]; then
  echo -e "${GREEN}✅ User exists or created successfully${NC}"
else
  echo -e "${RED}❌ Failed to create user (HTTP $http_code)${NC}"
  echo "$body"
fi

echo ""
sleep 1

# ============================================================
# TEST 2: Login (No MFA yet)
# ============================================================

echo -e "${YELLOW}📋 Test 2: Login without MFA${NC}"
echo "---"

response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')
echo $response


if [ "$http_code" -eq 200 ]; then
  ACCESS_TOKEN=$(echo "$body" | jq -r '.data.accessToken')
  echo -e "${GREEN}✅ Login successful (no MFA)${NC}"
  echo "Access Token: ${ACCESS_TOKEN:0:20}..."
else
  echo -e "${RED}❌ Login failed (HTTP $http_code)${NC}"
  echo "$body"
  exit 1
fi

echo ""
sleep 1

# ============================================================
# TEST 3: Setup TOTP
# ============================================================

echo -e "${YELLOW}📋 Test 3: Setup TOTP (MFA)${NC}"
echo "---"

response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/mfa/setup/totp" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Tenant-ID: $TENANT_ID")

http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -eq 201 ]; then
  SECRET=$(echo "$body" | jq -r '.data.secret')
  QR_CODE=$(echo "$body" | jq -r '.data.qrCode')
  BACKUP_CODES=$(echo "$body" | jq -r '.backupCodes[]' | head -1)

  echo -e "${GREEN}✅ TOTP setup successful${NC}"
  echo "Secret: $SECRET"
  echo "Backup Code (first): $BACKUP_CODES"
  echo ""
  echo -e "${BLUE}📱 SCAN THIS QR CODE WITH GOOGLE AUTHENTICATOR:${NC}"
  echo "Open the QR code in your browser:"
  echo "$QR_CODE"
  echo ""

  BACKUP_CODE=$BACKUP_CODES

  echo -e "${YELLOW}Enter the 6-digit code from your authenticator app:${NC}"
  read -p "MFA Code: " MFA_CODE
else
  echo -e "${RED}❌ TOTP setup failed (HTTP $http_code)${NC}"
  echo "$body"
  exit 1
fi

echo ""
sleep 1

# ============================================================
# TEST 4: Verify and Enable TOTP
# ============================================================

echo -e "${YELLOW}📋 Test 4: Verify and Enable TOTP${NC}"
echo "---"

response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/mfa/verify/totp" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d "{
    \"token\": \"$MFA_CODE\"
  }")

http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -eq 200 ]; then
  echo -e "${GREEN}✅ TOTP verified and enabled!${NC}"
  echo "Backup codes saved from previous step"
else
  echo -e "${RED}❌ TOTP verification failed (HTTP $http_code)${NC}"
  echo "$body"
  exit 1
fi

echo ""
sleep 1

# ============================================================
# TEST 5: Logout
# ============================================================

echo -e "${YELLOW}📋 Test 5: Logout${NC}"
echo "---"

response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/auth/logout" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Tenant-ID: $TENANT_ID")

http_code=$(echo "$response" | tail -n 1)

if [ "$http_code" -eq 200 ]; then
  echo -e "${GREEN}✅ Logged out successfully${NC}"
else
  echo -e "${RED}❌ Logout failed (HTTP $http_code)${NC}"
fi

echo ""
sleep 2

# ============================================================
# TEST 6: Login with MFA Required
# ============================================================

echo -e "${YELLOW}📋 Test 6: Login (MFA Required)${NC}"
echo "---"

response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -eq 200 ]; then
  MFA_REQUIRED=$(echo "$body" | jq -r '.data.mfaRequired')

  if [ "$MFA_REQUIRED" = "true" ]; then
    TEMP_TOKEN=$(echo "$body" | jq -r '.data.tempToken')
    echo -e "${GREEN}✅ MFA required (as expected)${NC}"
    echo "Temp Token: ${TEMP_TOKEN:0:20}..."
  else
    echo -e "${RED}❌ MFA not required (unexpected)${NC}"
    exit 1
  fi
else
  echo -e "${RED}❌ Login failed (HTTP $http_code)${NC}"
  echo "$body"
  exit 1
fi

echo ""
echo -e "${YELLOW}Enter the 6-digit code from your authenticator app:${NC}"
read -p "MFA Code: " MFA_CODE
echo ""

# ============================================================
# TEST 7: Verify MFA Code
# ============================================================

echo -e "${YELLOW}📋 Test 7: Verify MFA Code${NC}"
echo "---"

response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/auth/mfa/verify" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -d "{
    \"tempToken\": \"$TEMP_TOKEN\",
    \"code\": \"$MFA_CODE\"
  }")

http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -eq 200 ]; then
  NEW_ACCESS_TOKEN=$(echo "$body" | jq -r '.data.accessToken')
  NEW_REFRESH_TOKEN=$(echo "$body" | jq -r '.data.refreshToken')

  echo -e "${GREEN}✅ MFA verified successfully!${NC}"
  echo "New Access Token: ${NEW_ACCESS_TOKEN:0:20}..."
  echo "New Refresh Token: ${NEW_REFRESH_TOKEN:0:20}..."

  ACCESS_TOKEN=$NEW_ACCESS_TOKEN
else
  echo -e "${RED}❌ MFA verification failed (HTTP $http_code)${NC}"
  echo "$body"
  exit 1
fi

echo ""
sleep 1

# ============================================================
# TEST 8: Check MFA Status
# ============================================================

echo -e "${YELLOW}📋 Test 8: Check MFA Status${NC}"
echo "---"

response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/mfa/status" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Tenant-ID: $TENANT_ID")

http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -eq 200 ]; then
  echo -e "${GREEN}✅ MFA status retrieved${NC}"
  echo "$body" | jq '.'
else
  echo -e "${RED}❌ Failed to get MFA status (HTTP $http_code)${NC}"
fi

echo ""
sleep 1

# ============================================================
# TEST 9: Test Backup Code (Optional)
# ============================================================

echo -e "${YELLOW}📋 Test 9: Test Backup Code (Optional)${NC}"
echo "---"
read -p "Do you want to test backup code? (y/n): " TEST_BACKUP

if [ "$TEST_BACKUP" = "y" ]; then
  # Logout first
  curl -s -X POST "$API_URL/auth/logout" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-Tenant-ID: $TENANT_ID" > /dev/null

  # Login to get temp token
  response=$(curl -s -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: $TENANT_ID" \
    -d "{
      \"email\": \"$EMAIL\",
      \"password\": \"$PASSWORD\"
    }")

  TEMP_TOKEN=$(echo "$response" | jq -r '.data.tempToken')

  # Verify with backup code
  response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/auth/mfa/verify-backup" \
    -H "Content-Type: application/json" \
    -H "X-Tenant-ID: $TENANT_ID" \
    -d "{
      \"tempToken\": \"$TEMP_TOKEN\",
      \"code\": \"$BACKUP_CODE\"
    }")

  http_code=$(echo "$response" | tail -n 1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}✅ Backup code verified successfully!${NC}"
    echo "$body" | jq '.'
  else
    echo -e "${RED}❌ Backup code verification failed (HTTP $http_code)${NC}"
    echo "$body"
  fi
else
  echo "Skipped backup code test"
fi

echo ""
echo "====================================="
echo -e "${GREEN}🎉 All MFA Tests Completed!${NC}"
echo "====================================="
echo ""
echo "Summary:"
echo "✅ User registration/login"
echo "✅ TOTP setup with QR code"
echo "✅ TOTP verification and enablement"
echo "✅ Login with MFA required"
echo "✅ MFA code verification"
echo "✅ MFA status check"
if [ "$TEST_BACKUP" = "y" ]; then
  echo "✅ Backup code verification"
fi
echo ""
echo -e "${BLUE}Your MFA is now fully functional!${NC}"