import { expect, test, type Page } from "@playwright/test";

import {
  e2eEnvironment,
  hasSeededCatalogTarget,
  hasUserA,
} from "./support/environment";
import {
  createUserClient,
  deleteNewOwnItems,
  loginThroughUi,
  ownItemIdsForProductName,
  userACredentials,
} from "./support/supabase";

test.describe("@supabase authenticated MVP journeys", () => {
  test.skip(
    !hasUserA,
    "Requires Supabase plus E2E_USER_A_EMAIL and E2E_USER_A_PASSWORD.",
  );

  test("adds two units, consumes, finishes, and restocks without losing history", async ({
    page,
  }, testInfo) => {
    const productName = `E2E Fridge Flow ${testInfo.workerIndex}-${Date.now()}`;
    const client = await createUserClient(userACredentials());
    const originalItemIds = await ownItemIdsForProductName(client, productName);

    try {
      await loginThroughUi(page, userACredentials());
      await page.goto("/add");
      await page.getByRole("tab", { name: "Manual" }).click();
      await page.getByLabel("Product name").fill(productName);
      await page.getByRole("button", { name: "More units" }).click();
      await page.getByRole("button", { name: "Add to fridge" }).click();
      await expect(page.getByText(`Added ${productName} ×2`)).toBeVisible();

      await page.goto("/fridge");
      let card = productCard(page, productName);
      await expect(card).toBeVisible();
      await expect(
        card.getByRole("button", {
          name: "Unit 1 — full. Change level.",
        }),
      ).toBeVisible();
      await expect(
        card.getByRole("button", {
          name: "Unit 2 — full. Change level.",
        }),
      ).toBeVisible();

      await card
        .getByRole("button", { name: "Unit 1 — full. Change level." })
        .click();
      await page.getByRole("radio", { name: /½.*50 %/ }).click();
      await expect(page.getByText("Set to ½")).toBeVisible();

      card = productCard(page, productName);
      await expect(
        card.getByRole("button", {
          name: "Unit 1 — half remaining. Change level.",
        }),
      ).toBeVisible();
      await card
        .getByRole("button", {
          name: "Unit 1 — half remaining. Change level.",
        })
        .click();
      await page.getByRole("radio", { name: /Finished — all gone/ }).click();
      await expect(
        page.getByText(`${productName} finished — it's on your Restock list`),
      ).toBeVisible();

      // The approved query hides a finished product while another live unit
      // of that product remains. Assert only on this test's product — the
      // shared test account may legitimately have other recently-finished
      // items, so the section-wide empty state is not this test's to claim.
      await page.goto("/restock");
      let finishedSection = sectionNamed(page, "Recently finished");
      await expect(
        finishedSection.getByRole("button", {
          name: `Restock ${productName}`,
        }),
      ).toHaveCount(0);
      await expect(page.getByText(`Consumed ${productName} → ½`)).toBeVisible();

      await page.goto("/fridge");
      card = productCard(page, productName);
      await card
        .getByRole("button", { name: "Unit 1 — full. Change level." })
        .click();
      await page.getByRole("radio", { name: /Finished — all gone/ }).click();
      // Wait for the mutation to commit before navigating away; the earlier
      // full-page navigations unmounted the first finish toast, so this text
      // is unambiguous again.
      await expect(
        page.getByText(`${productName} finished — it's on your Restock list`),
      ).toBeVisible();

      await page.goto("/restock");
      finishedSection = sectionNamed(page, "Recently finished");
      await expect(finishedSection.getByText(productName)).toBeVisible();
      await finishedSection
        .getByRole("button", { name: `Restock ${productName}` })
        .click();
      await expect(
        page.getByText(`${productName} added to your fridge`),
      ).toBeVisible();

      await page.goto("/fridge");
      card = productCard(page, productName);
      await expect(
        card.getByRole("button", {
          name: "Unit 1 — full. Change level.",
        }),
      ).toBeVisible();

      // Restocking inserts a fresh row; both finished physical rows remain.
      await page.goto("/fridge?filter=finished");
      card = productCard(page, productName);
      await expect(
        card.getByRole("button", { name: /finished\. Change level\./ }),
      ).toHaveCount(2);
    } finally {
      await deleteNewOwnItems(client, productName, originalItemIds);
      await client.auth.signOut();
    }
  });

  test("handles invalid and store-internal typed barcodes without a camera", async ({
    page,
  }) => {
    await loginThroughUi(page, userACredentials());
    await page.goto("/add");

    const barcode = page.getByLabel("Or type the barcode");
    await barcode.fill("1234567890123");
    await page.getByRole("button", { name: "Look up" }).click();
    await expect(
      page.getByText(
        "That code doesn't look right — check the digits under the lines.",
      ),
    ).toBeVisible();

    await barcode.fill("2000000000008");
    await page.getByRole("button", { name: "Look up" }).click();
    // Heading role: the same text also exists in an sr-only live region
    // (screen-reader announcement), so a bare getByText is ambiguous.
    await expect(
      page.getByRole("heading", { name: "Looks like a weighed item" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add manually" }).click();

    await expect(page.getByRole("tab", { name: "Manual" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByLabel("Barcode (optional)")).toHaveValue("");
    await page.getByRole("button", { name: "Add to fridge" }).click();
    await expect(
      page.getByText("Give it a name and you're done."),
    ).toBeVisible();

    const invalidLookup = await page.request.get(
      "/api/products/lookup?barcode=1234567890123",
    );
    expect(invalidLookup.status()).toBe(200);
    expect((await invalidLookup.json()).status).toBe("invalid");

    const malformedSearch = await page.request.get("/api/products/search?q=");
    expect(malformedSearch.status()).toBe(400);
  });

  test("hands a deterministic no-result search to the manual form", async ({
    page,
  }, testInfo) => {
    const query = `E2E-No-Result-${testInfo.workerIndex}-${Date.now()}`;

    await loginThroughUi(page, userACredentials());
    await page.goto("/add");
    await page.getByRole("tab", { name: "Search" }).click();
    await page.getByLabel("Search the product catalog").fill(query);
    await expect(page.getByText(`Nothing for “${query}”`)).toBeVisible();
    await page.getByRole("button", { name: "Add it manually" }).click();

    await expect(page.getByRole("tab", { name: "Manual" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByLabel("Product name")).toHaveValue(query);
  });

  test("adds a configured seeded-catalog product through Search", async ({
    page,
  }) => {
    test.skip(
      !hasSeededCatalogTarget,
      "Set E2E_CATALOG_QUERY and E2E_CATALOG_PRODUCT_NAME to enable.",
    );

    const productName = e2eEnvironment.catalog.productName as string;
    const client = await createUserClient(userACredentials());
    const originalItemIds = await ownItemIdsForProductName(client, productName);

    try {
      await loginThroughUi(page, userACredentials());
      await page.goto("/add");
      await page.getByRole("tab", { name: "Search" }).click();
      await page
        .getByLabel("Search the product catalog")
        .fill(e2eEnvironment.catalog.query as string);

      await page
        .getByRole("button")
        .filter({ hasText: productName })
        .first()
        .click();
      const dialog = page.getByRole("dialog", {
        name: `Add ${productName} to your fridge`,
      });
      await dialog.getByRole("button", { name: "Add to fridge" }).click();
      await expect(page.getByText(`Added ${productName}`)).toBeVisible();

      await page.goto("/fridge");
      await expect(productCard(page, productName)).toBeVisible();
    } finally {
      await deleteNewOwnItems(client, productName, originalItemIds);
      await client.auth.signOut();
    }
  });
});

function productCard(page: Page, productName: string) {
  return page.getByRole("article").filter({ hasText: productName });
}

function sectionNamed(page: Page, heading: string) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: heading }),
  });
}
