/**
 * Navigation reachability (F4): Chat must be a first-class destination in
 * both the desktop TopBar and the mobile BottomNav. Next runtime pieces are
 * mocked — these are static structure tests, not integration tests.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/fridge",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// TopBar pulls in the F2 bell (supabase client + server actions) — out of
// scope here.
vi.mock("@/components/notifications/NotificationBell", () => ({
  NotificationBell: () => null,
}));
vi.mock("@/components/app-shell/SignOutIconButton", () => ({
  SignOutIconButton: () => null,
}));
vi.mock("./SignOutIconButton", () => ({
  SignOutIconButton: () => null,
}));

import { BottomNav } from "./BottomNav";
import { TopBar } from "./TopBar";

describe("mobile BottomNav", () => {
  const html = renderToStaticMarkup(<BottomNav />);

  it("keeps all four destinations, ending with Chat", () => {
    for (const [href, label] of [
      ["/fridge", "Fridge"],
      ["/add", "Add"],
      ["/restock", "Restock"],
      ["/chat", "Chat"],
    ]) {
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(label);
    }
  });

  it("marks the active tab for assistive tech", () => {
    expect(html).toContain('aria-current="page"');
  });
});

describe("desktop TopBar", () => {
  it("links to Chat alongside the existing destinations", () => {
    const html = renderToStaticMarkup(<TopBar />);
    expect(html).toContain('href="/chat"');
    expect(html).toContain("Chat");
  });
});
