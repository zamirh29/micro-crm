"use client"

import { useEffect } from "react";

/**
 * When Supabase cannot apply a reset link's `redirect_to` (or an older email
 * was sent with a different one) it falls back to the site URL, dropping the
 * recovery tokens in the URL fragment on a page that never looks at them — the
 * user just sees the homepage. Forward them to /reset-password so the browser
 * client can claim the session and show the form.
 */
export default function RecoveryRedirect() {
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    if (pathname === "/reset-password") return;

    const hasCode = new URLSearchParams(search).has("code");
    const hasRecoveryFragment =
      hash.includes("access_token") && hash.includes("type=recovery");
    if (!hasCode && !hasRecoveryFragment) return;

    window.location.replace(`/reset-password${search}${hash}`);
  }, []);

  return null;
}
