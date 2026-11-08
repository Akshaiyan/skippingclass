import { describe, expect, it } from "vitest";
import { getAccounts, signIn } from "@/data/api";
import { canOpen } from "@/lib/roles";
import { initialStoreState, storeReducer } from "@/store";

describe("roles and sign-in", () => {
  it("reads the role from the stored profile, not from the sign-in form", () => {
    expect(signIn("lena.vogt@aegis.example", "x")?.role).toBe("operations_lead");
    expect(signIn(" Jonas.Weber@aegis.example ", "x")?.role).toBe("insurance_claimer");
    expect(signIn("someone@else.example", "x")).toBeNull();
    expect(signIn("lena.vogt@aegis.example", "")).toBeNull();
  });
  it("seeds one account per role", () => {
    expect(
      getAccounts()
        .map((a) => a.role)
        .sort(),
    ).toEqual(["insurance_claimer", "operations_lead"]);
  });
  it("limits policy change to operations leads", () => {
    for (const path of ["/", "/claims", "/log"]) {
      expect(canOpen("insurance_claimer", path)).toBe(true);
      expect(canOpen("operations_lead", path)).toBe(true);
    }
    expect(canOpen("insurance_claimer", "/policy")).toBe(false);
    expect(canOpen("operations_lead", "/policy")).toBe(true);
    expect(canOpen(undefined, "/")).toBe(false);
  });
  it("signing in names the reviewer; signing out clears the profile", () => {
    const lena = signIn("lena.vogt@aegis.example", "x")!;
    const signedIn = storeReducer(initialStoreState(), { type: "signIn", account: lena });
    expect(signedIn.user?.name).toBe("Lena Vogt");
    expect(signedIn.reviewer).toBe("Lena Vogt");
    expect(storeReducer(signedIn, { type: "signOut" }).user).toBeNull();
  });
});
