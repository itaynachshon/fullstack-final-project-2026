import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

export const e2eEnvironment = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  userA: {
    email: process.env.E2E_USER_A_EMAIL,
    password: process.env.E2E_USER_A_PASSWORD,
  },
  userB: {
    email: process.env.E2E_USER_B_EMAIL,
    password: process.env.E2E_USER_B_PASSWORD,
  },
  catalog: {
    query: process.env.E2E_CATALOG_QUERY,
    productName: process.env.E2E_CATALOG_PRODUCT_NAME,
  },
};

export const hasSupabase =
  Boolean(e2eEnvironment.supabaseUrl) &&
  Boolean(e2eEnvironment.supabaseAnonKey);

export const hasUserA =
  hasSupabase &&
  Boolean(e2eEnvironment.userA.email) &&
  Boolean(e2eEnvironment.userA.password);

export const hasTwoUsers =
  hasUserA &&
  Boolean(e2eEnvironment.userB.email) &&
  Boolean(e2eEnvironment.userB.password);

export const hasSeededCatalogTarget =
  hasUserA &&
  Boolean(e2eEnvironment.catalog.query) &&
  Boolean(e2eEnvironment.catalog.productName);
