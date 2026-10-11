# ADR-0003: Access-token delivery to browsers

- Status: Proposed
- Date: 2026-10-11

## Context
Project rules said tokens are delivered only as httpOnly cookies. `POST /auth/login` and
`POST /auth/refresh` also return `accessToken` in the JSON body so the SDK can send bearer
tokens. A body copy is readable by any script on the page, which removes the XSS protection
httpOnly cookies provide.

## Options
1. Cookie-only for browsers; bearer only for server-to-server and native clients.
2. Keep the body copy but only when the client opts in (e.g. `X-Token-Delivery: body`), off for
   the admin portal.
3. Status quo.

## Recommendation
Option 2 now (no breaking change for SDK users who opt in), moving to option 1 for the first-party
portal. Decide before 1.0; tracked as REMEDIATION_PLAN P0-8.
