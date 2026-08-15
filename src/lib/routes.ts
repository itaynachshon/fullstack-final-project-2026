/**
 * Route map — FROZEN CONTRACT (end of Wave 1).
 *
 * The five application routes approved in docs/TECHNICAL_DESIGN.md §9.1 plus
 * the pure path predicates used by the proxy (network boundary) for gating.
 * Pure functions — no Next.js imports — so they are unit-testable directly.
 */

export const ROUTES = {
  login: "/login",
  signup: "/signup",
  fridge: "/fridge",
  add: "/add",
  restock: "/restock",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

/** Pages that require an authenticated session. */
export const PROTECTED_PAGES = [
  ROUTES.fridge,
  ROUTES.add,
  ROUTES.restock,
] as const;

/** Public auth pages; authenticated visitors are redirected to /fridge. */
export const AUTH_PAGES = [ROUTES.login, ROUTES.signup] as const;

const API_PREFIX = "/api";

function matchesBase(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** True for /fridge, /add, /restock and any nested segment under them. */
export function isProtectedPagePath(pathname: string): boolean {
  return PROTECTED_PAGES.some((page) => matchesBase(pathname, page));
}

/** True for /login, /signup and any nested segment under them. */
export function isAuthPagePath(pathname: string): boolean {
  return AUTH_PAGES.some((page) => matchesBase(pathname, page));
}

/** All /api/* routes require an authenticated session (401 otherwise). */
export function isProtectedApiPath(pathname: string): boolean {
  return matchesBase(pathname, API_PREFIX);
}
