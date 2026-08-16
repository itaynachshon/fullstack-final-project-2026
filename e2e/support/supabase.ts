import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { e2eEnvironment } from "./environment";

export interface TestCredentials {
  email: string;
  password: string;
}

export function userACredentials(): TestCredentials {
  return requiredCredentials("User A", e2eEnvironment.userA);
}

export function userBCredentials(): TestCredentials {
  return requiredCredentials("User B", e2eEnvironment.userB);
}

export async function loginThroughUi(page: Page, credentials: TestCredentials) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/fridge$/);
  // exact: an empty fridge also renders the "Your fridge is empty" heading,
  // which substring-matches { name: "Fridge" } and trips strict mode.
  await expect(
    page.getByRole("heading", { name: "Fridge", exact: true }),
  ).toBeVisible();
}

/**
 * Creates an ordinary anon-key client and signs in as a test user. Operations
 * performed with this client are subject to the same RLS policies as the app.
 */
export async function createUserClient(
  credentials: TestCredentials,
): Promise<SupabaseClient> {
  const url = e2eEnvironment.supabaseUrl;
  const key = e2eEnvironment.supabaseAnonKey;
  if (!url || !key) {
    throw new Error("Supabase URL and anon key are required for this test.");
  }

  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { error } = await client.auth.signInWithPassword(credentials);
  if (error) throw new Error(`E2E sign-in failed: ${error.message}`);
  return client;
}

export async function ownItemIdsForProductName(
  client: SupabaseClient,
  productName: string,
): Promise<Set<string>> {
  const { data: products, error: productError } = await client
    .from("products")
    .select("id")
    .eq("name", productName);
  if (productError) throw productError;

  const productIds = (products ?? []).map((product) => product.id as string);
  if (productIds.length === 0) return new Set();

  const { data: items, error: itemError } = await client
    .from("fridge_items")
    .select("id")
    .in("product_id", productIds);
  if (itemError) throw itemError;

  return new Set((items ?? []).map((item) => item.id as string));
}

export async function deleteNewOwnItems(
  client: SupabaseClient,
  productName: string,
  itemIdsBeforeTest: ReadonlySet<string>,
) {
  const currentIds = await ownItemIdsForProductName(client, productName);
  const createdIds = [...currentIds].filter((id) => !itemIdsBeforeTest.has(id));
  if (createdIds.length === 0) return;

  const { error } = await client
    .from("fridge_items")
    .delete()
    .in("id", createdIds);
  if (error) throw error;
}

function requiredCredentials(
  label: string,
  values: { email?: string; password?: string },
): TestCredentials {
  if (!values.email || !values.password) {
    throw new Error(`${label} credentials are not configured.`);
  }
  return { email: values.email, password: values.password };
}
