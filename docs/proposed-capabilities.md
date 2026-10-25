# Proposed capabilities

Families designed in Figma (checklist `N01`-`N14`) whose backend contract does not exist. Each is
flagged `false` in `apps/admin-portal/constants/feature-flags.ts` and renders a *Planned* shell: real
layout, no data, disabled controls, and a written handoff (purpose, persona, contract, permissions,
audit events, acceptance). Nothing here shows sample data or success. When the contract lands, build
the feature under `features/<name>/` and flip the flag in the same change.

"Shell" means the screen layout and handoff exist in the portal. It is not frontend API integration.

| Id | Name | Required contract (suggested) | Status |
|---|---|---|---|
| N05 | Billing and usage | `GET /tenants/:id/billing/{subscription,usage,invoices}`, `POST .../plan-change`, `POST .../payment-method/session` | Shell: `/t/[slug]/billing` (`features/capabilities`) |
| N07 | Platform people and support | `GET /admin/people`, `GET /admin/people/:userId`, `POST /admin/people/:userId/support-actions` (access reason required) | Shell: `/users` (platform) |
| N09 | Provisioning operations | `GET /tenants/:id/provisioning/runs`, `.../runs/:runId/records`, `POST .../retry`, `POST .../conflicts/:id/resolve`, `GET .../mapping/preview` (SCIM protocol endpoints already exist and are out of scope) | Shell: `/t/[slug]/connections/provisioning` |
| N13 | Notifications and communication | `GET/PUT /notifications/preferences`, `GET /tenants/:id/email/deliveries`, `GET /notifications/templates/:key/preview` | Shell: `/t/[slug]/notifications` |
| N01 | Workspace authentication policies | Policy read/update endpoints | Other slice |
| N02 | OAuth consent and connected applications | Grant list/revoke | Other slice |
| N03 | Domain and email setup | Domain verification, sender domain | Other slice |
| N04 | Organization ownership and deletion | Transfer consent token, scheduled deletion | Other slice |
| N06 | Service credentials | Credential issue/rotate/revoke | Other slice |
| N08 | Privacy and audit governance | Retention, export/erasure requests | Other slice |
| N10 | Invitation lifecycle | Resend/reissue, invitee flows | Other slice |
| N11 | Factor lifecycle and recovery | Step-up, factor removal | Other slice |
| N12 | Permission boundaries and policy diagnostics | Boundary and diagnostics endpoints | Other slice |
| N14 | Developer integration workspace | Request log | Other slice |

Global states (not found, error boundary, global error, denied, unavailable) are real, not proposed:
`app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx` via `GlobalStateView`.
