import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/routes";

/**
 * The root path has no content of its own: the proxy sends unauthenticated
 * visitors of /fridge to /login, so this redirect lands everyone in the
 * right place.
 */
export default function RootPage() {
  redirect(ROUTES.fridge);
}
