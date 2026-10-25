"use client";

import { ProposedCapabilityView } from "@/features/capabilities/views/ProposedCapabilityView";

/**
 * N02 connected applications. Consent itself is served by the hosted /u/consent flow;
 * listing and revoking a person's grants has no endpoint yet, so this renders the
 * honest proposed-capability view with no data and no actions.
 * TODO(gap:N02-grants): needs GET /users/me/consents and DELETE /users/me/consents/:clientId.
 */
export function ConnectedApplicationsView() {
  return <ProposedCapabilityView id="consent" />;
}
