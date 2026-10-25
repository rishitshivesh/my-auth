import { account } from "./account";
import { auth } from "./auth";
import { capabilities } from "./capabilities";
import { common } from "./common";
import { errors } from "./errors";
import { platform } from "./platform";
import { states } from "./states";
import { tenantAccess } from "./tenant-access";
import { tenantAdmin } from "./tenant-admin";
import { tenant } from "./tenant";
import { tenantIntegrations } from "./tenant-integrations";

/** English catalogue, one file per feature area. */
export const en = { auth, account, tenant, platform, common, errors, states, capabilities, tenantIntegrations, tenantAdmin, ...tenantAccess } as const;
