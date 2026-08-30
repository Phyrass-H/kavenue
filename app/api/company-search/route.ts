// Proxy for the French company register, used by the sign-up form.
//
// ⚑ IT EXISTS TO CARRY A SESSION CHECK, NOT TO HIDE A KEY — there is no key.
// `recherche-entreprises.api.gouv.fr` is public and unauthenticated; going
// through here keeps kavenue.fr from being an open search proxy for anyone who
// finds the path, and keeps the endpoint, the timeout and the closed-
// establishment filter in one place (lib/company-register.ts).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchCompanies } from "@/lib/company-register";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q") ?? "";
  const result = await searchCompanies(q);

  // ⚑ "Unreachable" is a 200 carrying a fact, not a 502. The form has a real
  // answer for it — fill it in by hand — and a failed request status would send
  // the browser's own error handling down a path that has nothing useful to say.
  return NextResponse.json(result);
}
