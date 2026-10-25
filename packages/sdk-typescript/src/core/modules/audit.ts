/** Tenant audit log (admin): filtered, cursor-paginated list and CSV export. */

import type { AuditFilters, AuditPage } from "../api-types";
import { buildQuery, call, type ModuleContext } from "./context";

export interface AuditModule {
  list(filters?: AuditFilters): Promise<AuditPage>;
  /** CSV text of up to 10,000 matching events. */
  exportCsv(filters?: AuditFilters): Promise<string>;
}

export function createAuditModule(ctx: ModuleContext): AuditModule {
  const url = (path: string, filters: AuditFilters = {}): string =>
    `${ctx.baseURL}/audit${path}${buildQuery(filters)}`;
  return {
    list: (filters) => call<AuditPage>(ctx, { url: url("", filters), method: "GET" }),
    async exportCsv(filters) {
      const response = await ctx.request({ url: url("/export", filters), method: "GET" });
      if (!response.ok) throw ctx.fail(response);
      return typeof response.data === "string" ? response.data : "";
    },
  };
}
