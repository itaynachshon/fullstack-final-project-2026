import { describe, expect, it } from "vitest";

import {
  isAuthPagePath,
  isProtectedApiPath,
  isProtectedPagePath,
  ROUTES,
} from "@/lib/routes";

describe("ROUTES (frozen route map)", () => {
  it("contains exactly the five approved routes", () => {
    expect(ROUTES).toEqual({
      login: "/login",
      signup: "/signup",
      fridge: "/fridge",
      add: "/add",
      restock: "/restock",
    });
  });
});

describe("isProtectedPagePath", () => {
  it.each([
    "/fridge",
    "/add",
    "/restock",
    "/fridge/anything",
    "/add/scan",
    "/chat",
    "/chat/abc",
  ])("treats %s as protected", (path) => {
    expect(isProtectedPagePath(path)).toBe(true);
  });

  it.each([
    "/",
    "/login",
    "/signup",
    "/api/products/lookup",
    // Prefix boundaries: /fridgex must not match /fridge.
    "/fridgex",
    "/additional",
    "/chatting",
    // No settings page ships; the F0 route reservation was removed by F5.
    "/settings",
  ])("treats %s as not protected", (path) => {
    expect(isProtectedPagePath(path)).toBe(false);
  });
});

describe("isAuthPagePath", () => {
  it.each(["/login", "/signup", "/login/reset"])(
    "treats %s as an auth page",
    (path) => {
      expect(isAuthPagePath(path)).toBe(true);
    },
  );

  it.each(["/", "/fridge", "/loginx", "/api"])(
    "treats %s as not an auth page",
    (path) => {
      expect(isAuthPagePath(path)).toBe(false);
    },
  );
});

describe("isProtectedApiPath", () => {
  it.each(["/api", "/api/products/lookup", "/api/products/search"])(
    "treats %s as a protected API path",
    (path) => {
      expect(isProtectedApiPath(path)).toBe(true);
    },
  );

  it.each(["/apix", "/fridge", "/"])(
    "treats %s as not a protected API path",
    (path) => {
      expect(isProtectedApiPath(path)).toBe(false);
    },
  );
});
