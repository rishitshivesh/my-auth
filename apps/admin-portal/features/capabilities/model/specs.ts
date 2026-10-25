import { familyKey, itemKey, sectionKey } from "./spec-keys";
import type { CapabilityScreenSpec, ScreenFamily } from "./types";

const billing: CapabilityScreenSpec = {
  family: "billing",
  checklistId: "N05",
  capability: "billing",
  title: familyKey("billing", "title"),
  summary: familyKey("billing", "summary"),
  purpose: familyKey("billing", "purpose"),
  persona: familyKey("billing", "persona"),
  acceptance: [familyKey("billing", "acc1"), familyKey("billing", "acc2"), familyKey("billing", "acc3")],
  contracts: [
    { method: "GET", path: "/tenants/:tenantId/billing/subscription", dto: "SubscriptionResponseDto" },
    { method: "GET", path: "/tenants/:tenantId/billing/usage", dto: "UsageResponseDto" },
    { method: "GET", path: "/tenants/:tenantId/billing/invoices", dto: "InvoiceListResponseDto" },
    { method: "POST", path: "/tenants/:tenantId/billing/plan-change", dto: "ChangePlanDto" },
    { method: "POST", path: "/tenants/:tenantId/billing/payment-method/session", dto: "PaymentMethodSessionDto" },
  ],
  permissions: ["billing:read", "billing:manage"],
  auditEvents: ["billing.plan.changed", "billing.payment_method.updated", "billing.invoice.downloaded"],
  sections: [
    {
      id: "overview",
      heading: sectionKey("billing", "overview", "heading"),
      empty: sectionKey("billing", "overview", "empty"),
      tiles: [
        itemKey("billing", "overview", "tiles", "plan"),
        itemKey("billing", "overview", "tiles", "renewal"),
        itemKey("billing", "overview", "tiles", "usage"),
      ],
      actions: [itemKey("billing", "overview", "actions", "compare")],
    },
    {
      id: "usage",
      heading: sectionKey("billing", "usage", "heading"),
      empty: sectionKey("billing", "usage", "empty"),
      columns: [
        itemKey("billing", "usage", "cols", "metric"),
        itemKey("billing", "usage", "cols", "used"),
        itemKey("billing", "usage", "cols", "limit"),
        itemKey("billing", "usage", "cols", "resets"),
      ],
    },
    {
      id: "invoices",
      heading: sectionKey("billing", "invoices", "heading"),
      empty: sectionKey("billing", "invoices", "empty"),
      columns: [
        itemKey("billing", "invoices", "cols", "invoice"),
        itemKey("billing", "invoices", "cols", "period"),
        itemKey("billing", "invoices", "cols", "status"),
        itemKey("billing", "invoices", "cols", "download"),
      ],
    },
    {
      id: "payment",
      heading: sectionKey("billing", "payment", "heading"),
      empty: sectionKey("billing", "payment", "empty"),
      actions: [itemKey("billing", "payment", "actions", "update")],
    },
  ],
};

const platformPeople: CapabilityScreenSpec = {
  family: "platformPeople",
  checklistId: "N07",
  capability: "notAvailableForPlatform",
  title: familyKey("platformPeople", "title"),
  summary: familyKey("platformPeople", "summary"),
  purpose: familyKey("platformPeople", "purpose"),
  persona: familyKey("platformPeople", "persona"),
  acceptance: [familyKey("platformPeople", "acc1"), familyKey("platformPeople", "acc2"), familyKey("platformPeople", "acc3")],
  contracts: [
    { method: "GET", path: "/admin/people", dto: "PlatformPeopleQueryDto" },
    { method: "GET", path: "/admin/people/:userId", dto: "PlatformPersonResponseDto" },
    { method: "POST", path: "/admin/people/:userId/support-actions", dto: "SupportActionDto" },
  ],
  permissions: ["platform:people:read", "platform:people:support"],
  auditEvents: ["platform.people.searched", "platform.people.viewed", "platform.support_action.executed"],
  sections: [
    {
      id: "search",
      heading: sectionKey("platformPeople", "search", "heading"),
      empty: sectionKey("platformPeople", "search", "empty"),
      fields: [
        itemKey("platformPeople", "search", "fields", "query"),
        itemKey("platformPeople", "search", "fields", "reason"),
      ],
      actions: [itemKey("platformPeople", "search", "actions", "search")],
    },
    {
      id: "results",
      heading: sectionKey("platformPeople", "results", "heading"),
      empty: sectionKey("platformPeople", "results", "empty"),
      columns: [
        itemKey("platformPeople", "results", "cols", "person"),
        itemKey("platformPeople", "results", "cols", "email"),
        itemKey("platformPeople", "results", "cols", "workspaces"),
        itemKey("platformPeople", "results", "cols", "status"),
      ],
    },
    {
      id: "support",
      heading: sectionKey("platformPeople", "support", "heading"),
      empty: sectionKey("platformPeople", "support", "empty"),
      actions: [
        itemKey("platformPeople", "support", "actions", "signOut"),
        itemKey("platformPeople", "support", "actions", "resetMfa"),
        itemKey("platformPeople", "support", "actions", "suspend"),
      ],
    },
  ],
};

const provisioning: CapabilityScreenSpec = {
  family: "provisioning",
  checklistId: "N09",
  capability: "provisioning",
  title: familyKey("provisioning", "title"),
  summary: familyKey("provisioning", "summary"),
  purpose: familyKey("provisioning", "purpose"),
  persona: familyKey("provisioning", "persona"),
  acceptance: [familyKey("provisioning", "acc1"), familyKey("provisioning", "acc2"), familyKey("provisioning", "acc3")],
  contracts: [
    { method: "GET", path: "/tenants/:tenantId/provisioning/runs", dto: "ProvisioningRunListDto" },
    { method: "GET", path: "/tenants/:tenantId/provisioning/runs/:runId/records", dto: "ProvisioningRecordListDto" },
    { method: "POST", path: "/tenants/:tenantId/provisioning/runs/:runId/retry", dto: "RetryRunDto" },
    { method: "POST", path: "/tenants/:tenantId/provisioning/conflicts/:id/resolve", dto: "ResolveConflictDto" },
    { method: "GET", path: "/tenants/:tenantId/provisioning/mapping/preview", dto: "MappingPreviewDto" },
  ],
  permissions: ["provisioning:read", "provisioning:manage"],
  auditEvents: ["provisioning.run.started", "provisioning.run.retried", "provisioning.conflict.resolved"],
  sections: [
    {
      id: "runs",
      heading: sectionKey("provisioning", "runs", "heading"),
      empty: sectionKey("provisioning", "runs", "empty"),
      columns: [
        itemKey("provisioning", "runs", "cols", "run"),
        itemKey("provisioning", "runs", "cols", "source"),
        itemKey("provisioning", "runs", "cols", "result"),
        itemKey("provisioning", "runs", "cols", "action"),
      ],
      actions: [
        itemKey("provisioning", "runs", "actions", "inspect"),
        itemKey("provisioning", "runs", "actions", "start"),
      ],
    },
    {
      id: "conflicts",
      heading: sectionKey("provisioning", "conflicts", "heading"),
      empty: sectionKey("provisioning", "conflicts", "empty"),
      columns: [
        itemKey("provisioning", "conflicts", "cols", "record"),
        itemKey("provisioning", "conflicts", "cols", "conflict"),
        itemKey("provisioning", "conflicts", "cols", "resolution"),
      ],
      actions: [itemKey("provisioning", "conflicts", "actions", "retry")],
    },
    {
      id: "mapping",
      heading: sectionKey("provisioning", "mapping", "heading"),
      empty: sectionKey("provisioning", "mapping", "empty"),
      columns: [
        itemKey("provisioning", "mapping", "cols", "source"),
        itemKey("provisioning", "mapping", "cols", "target"),
        itemKey("provisioning", "mapping", "cols", "transform"),
      ],
    },
  ],
};

const notifications: CapabilityScreenSpec = {
  family: "notifications",
  checklistId: "N13",
  capability: "notifications",
  title: familyKey("notifications", "title"),
  summary: familyKey("notifications", "summary"),
  purpose: familyKey("notifications", "purpose"),
  persona: familyKey("notifications", "persona"),
  acceptance: [familyKey("notifications", "acc1"), familyKey("notifications", "acc2"), familyKey("notifications", "acc3")],
  contracts: [
    { method: "GET", path: "/notifications/preferences", dto: "NotificationPreferencesDto" },
    { method: "PUT", path: "/notifications/preferences", dto: "UpdateNotificationPreferencesDto" },
    { method: "GET", path: "/tenants/:tenantId/email/deliveries", dto: "EmailDeliveryListDto" },
    { method: "GET", path: "/notifications/templates/:key/preview", dto: "TemplatePreviewDto" },
  ],
  permissions: ["notifications:read", "notifications:manage", "email:deliveries:read"],
  auditEvents: ["notifications.preferences.updated", "email.delivery.failed"],
  sections: [
    {
      id: "preferences",
      heading: sectionKey("notifications", "preferences", "heading"),
      empty: sectionKey("notifications", "preferences", "empty"),
      columns: [
        itemKey("notifications", "preferences", "cols", "event"),
        itemKey("notifications", "preferences", "cols", "email"),
        itemKey("notifications", "preferences", "cols", "required"),
      ],
      actions: [itemKey("notifications", "preferences", "actions", "save")],
    },
    {
      id: "delivery",
      heading: sectionKey("notifications", "delivery", "heading"),
      empty: sectionKey("notifications", "delivery", "empty"),
      columns: [
        itemKey("notifications", "delivery", "cols", "message"),
        itemKey("notifications", "delivery", "cols", "recipient"),
        itemKey("notifications", "delivery", "cols", "status"),
        itemKey("notifications", "delivery", "cols", "sent"),
      ],
    },
    {
      id: "preview",
      heading: sectionKey("notifications", "preview", "heading"),
      empty: sectionKey("notifications", "preview", "empty"),
      fields: [itemKey("notifications", "preview", "fields", "template")],
    },
  ],
};

export const SCREEN_SPECS: Readonly<Record<ScreenFamily, CapabilityScreenSpec>> = {
  billing,
  platformPeople,
  provisioning,
  notifications,
};

export const SCREEN_FAMILIES = Object.keys(SCREEN_SPECS) as ScreenFamily[];
