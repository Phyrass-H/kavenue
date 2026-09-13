import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAppContext, routeFor } from "@/lib/app-context";
import { roleSubOf } from "@/lib/hosts";
import { LoginForm } from "./login-form";

// Server wrapper: route already-authenticated users onward (by role) instead of
// showing them the sign-in form again, and pass any callback error to the form.
// The `side` (driver vs dispatch) comes from the host so each subdomain's login
// reads correctly (e.g. dispatch.* no longer says "Kavenue Driver").
//
// ⚑ S80 — AND `?side=admin` ON A SHARED HOST. localhost and *.vercel.app have no admin
// subdomain, so the admin door is named in the address instead ([[d141]]). Only "admin"
// is read from it: a Driver or Business side still comes from the host alone.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; side?: string }>;
}) {
  const ctx = await getAppContext();
  if (ctx.user) redirect(routeFor(ctx));

  const { error, side } = await searchParams;
  const devEnabled =
    process.env.NODE_ENV !== "production" && !process.env.VERCEL;
  const host = (await headers()).get("host");
  return (
    <LoginForm
      initialError={error ?? null}
      devEnabled={devEnabled}
      side={roleSubOf(host) ?? (side === "admin" ? "admin" : null)}
    />
  );
}
