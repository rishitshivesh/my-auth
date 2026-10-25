import { account } from "./account";
import { auth } from "./auth";
import { common } from "./common";
import { errors } from "./errors";
import { platform } from "./platform";
import { states } from "./states";
import { tenant } from "./tenant";

/** English catalogue, one file per feature area. */
export const en = { auth, account, tenant, platform, common, errors, states } as const;
