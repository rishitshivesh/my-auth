export const platform = {
  shell: {
    title: "Platform console",
    badge: "Platform",
    nav: {
      dashboard: "Dashboard",
      tenants: "Workspaces",
      people: "People",
      audit: "Audit log",
      settings: "Settings",
    },
    sections: { operate: "Operate", govern: "Govern", configure: "Configure" },
  },
} as const;
