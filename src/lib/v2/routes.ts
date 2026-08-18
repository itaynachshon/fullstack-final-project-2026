/**
 * V2 path constants — FROZEN CONTRACT (agent F0).
 *
 * Merged into `isProtectedPagePath` from `src/lib/routes.ts` so unauthenticated
 * visits redirect to /login even before F2/F3 add the pages.
 *
 * F2 owns `/settings`. F3 owns `/chat`. Item history is a sheet under `/fridge`
 * (already protected by the MVP `/fridge` prefix).
 */

export const V2_ROUTES = {
  settings: "/settings",
  chat: "/chat",
} as const;

export type V2AppRoute = (typeof V2_ROUTES)[keyof typeof V2_ROUTES];

export const V2_PROTECTED_PAGES = [V2_ROUTES.settings, V2_ROUTES.chat] as const;

export const V2_API_ROUTES = {
  aiChat: "/api/ai/chat",
} as const;
