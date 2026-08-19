import { expect, test, type Page } from "@playwright/test";

test.describe("@public authentication boundaries", () => {
  test("redirects logged-out visitors away from protected pages", async ({
    page,
  }) => {
    for (const route of ["/fridge", "/add", "/restock", "/chat"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
    }
  });

  test("rejects logged-out API requests with a generic 401 response", async ({
    request,
  }) => {
    const response = await request.get("/api/products/search?q=milk");

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "unauthenticated",
        message: "Authentication required.",
      },
    });
  });

  test("rejects logged-out AI chat requests with a 401 response", async ({
    request,
  }) => {
    const response = await request.post("/api/ai/chat", {
      data: { message: "What can I cook?" },
    });

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "unauthenticated",
        message: "Authentication required.",
      },
    });
  });

  test("keeps public login and scanner surfaces within required viewports", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);

      await page.goto("/login");
      await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
      expect(await hasHorizontalOverflow(page)).toBe(false);

      await page.goto("/scan-test");
      await expect(
        page.getByRole("heading", { name: "Scanner test" }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Barcode scanner" }),
      ).toBeVisible();
      expect(await hasHorizontalOverflow(page)).toBe(false);
    }
  });
});

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
}
