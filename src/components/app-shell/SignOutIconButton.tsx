"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LoaderCircleIcon, LogOutIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

/**
 * 44px ghost icon sign-out (UI_DESIGN §6.3 header / §5.4 top bar). Uses the
 * same Supabase browser client as the Wave 1 auth foundation.
 */
export function SignOutIconButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace(ROUTES.login);
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Sign out"
      disabled={pending}
      onClick={handleSignOut}
    >
      {pending ? (
        <LoaderCircleIcon className="size-5 animate-spin motion-reduce:animate-none" />
      ) : (
        <LogOutIcon className="size-5" />
      )}
    </Button>
  );
}
