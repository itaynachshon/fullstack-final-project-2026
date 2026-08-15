import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/AuthForm";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Sign up",
};

export default function SignupPage() {
  return (
    <div className="flex flex-col gap-6">
      <AuthForm mode="signup" />
      <p className="text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link
          href={ROUTES.login}
          className="font-medium text-zinc-900 underline underline-offset-2"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
