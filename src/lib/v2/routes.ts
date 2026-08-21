/**
 * V2 path constants — FROZEN CONTRACT (agent F0, amended by F5 integration).
 *
 * Merged into `isProtectedPagePath` from `src/lib/routes.ts` so unauthenticated
 * visits redirect to /login.
 *
 * F3 shipped `/chat`. Item history is a sheet under `/fridge` and reminder
 * configuration lives on `/restock` (both already protected by MVP prefixes),
 * so the originally reserved `/settings` route never gained a page or a
 * runtime consumer — F5 removed the dead constant instead of shipping a
 * placeholder page.
 */

export const V2_ROUTES = {
  chat: "/chat",
} as const;

export type V2AppRoute = (typeof V2_ROUTES)[keyof typeof V2_ROUTES];

export const V2_PROTECTED_PAGES = [V2_ROUTES.chat] as const;

export const V2_API_ROUTES = {
  aiChat: "/api/ai/chat",
} as const;
