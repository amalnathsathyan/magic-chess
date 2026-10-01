"use client";

import { useCallback } from "react";
import { useLogin, type LoginModalOptions } from "@privy-io/react-auth";
import { toast } from "sonner";

/**
 * Plain-language causes for Privy login failures. Most of these are Privy
 * dashboard settings rather than code, so the message names where to look.
 */
const LOGIN_ERROR_HELP: Record<string, string> = {
  disallowed_login_method:
    "This sign-in method isn't enabled for the app (Privy Dashboard → Login methods).",
  allowlist_rejected: "This account isn't on the app's allowlist.",
  missing_or_invalid_privy_app_id:
    "The app's Privy ID is wrong for this site (check NEXT_PUBLIC_PRIVY_APP_ID at build time).",
  embedded_wallet_create_error:
    "Signed in, but the Solana wallet couldn't be created. Solana embedded wallets may be disabled for this app.",
  unknown_embedded_wallet_error:
    "Signed in, but the Solana wallet couldn't be created. Solana embedded wallets may be disabled for this app.",
  generic_connect_wallet_error:
    "Your wallet didn't connect. Unlock it, switch it to Solana, and try again.",
  unknown_connect_wallet_error:
    "Your wallet didn't connect. Unlock it, switch it to Solana, and try again.",
  unable_to_sign: "Your wallet didn't sign the sign-in message.",
  oauth_user_denied: "Google sign-in was cancelled.",
  oauth_unexpected:
    "Google sign-in didn't complete. This site may be missing from the app's allowed domains / OAuth redirect URLs.",
  captcha_failure: "The bot check failed. Disable strict tracking protection and try again.",
  captcha_timeout: "The bot check timed out. Try again.",
  session_storage_unavailable:
    "Your browser is blocking storage this site needs (private mode or strict cookie settings).",
  too_many_requests: "Too many sign-in attempts. Wait a minute and try again.",
  client_request_timeout: "Sign-in timed out. Check your connection and try again.",
};

const SILENT = new Set(["exited_auth_flow", "exited_link_flow"]);

/**
 * Opens the Privy login modal (Solana wallets only) and reports failures with
 * Privy's error code instead of a generic "something went wrong".
 */
export function useAppLogin() {
  const { login } = useLogin({
    onError: (error) => {
      const code = String(error);
      console.error("Privy login failed:", code, error);
      if (SILENT.has(code)) return;
      toast.error("Sign-in didn't complete", {
        description: `${LOGIN_ERROR_HELP[code] ?? "Please try again."} (${code})`,
        duration: 10_000,
      });
    },
  });

  return useCallback(
    (options?: LoginModalOptions) =>
      login({ walletChainType: "solana-only", ...options }),
    [login]
  );
}
