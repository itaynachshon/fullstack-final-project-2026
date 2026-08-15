import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/AuthForm";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Log in",
};

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <AuthForm mode="login" />
      <p className="text-center text-sm text-zinc-500">
        New here?{" "}
        <Link
          href={ROUTES.signup}
          className="font-medium text-zinc-900 underline underline-offset-2"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
