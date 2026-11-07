import type { Role } from "@/types";

export const ROLE_LABEL: Record<Role, string> = {
  insurance_claimer: "Insurance claimer",
  operations_lead: "Operations lead",
};

/** Pages each role can open. Policy change is limited to operations leads. */
const ACCESS: Record<Role, readonly string[]> = {
  insurance_claimer: ["/", "/claims", "/log"],
  operations_lead: ["/", "/claims", "/policy", "/business", "/log"],
};

export const canOpen = (role: Role | undefined, path: string) =>
  !!role && ACCESS[role].includes(path);
