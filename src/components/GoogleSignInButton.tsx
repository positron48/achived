"use client";

import { signIn } from "next-auth/react";

export function GoogleSignInButton() {
  return (
    <button
      type="button"
      className="mt-6 inline-flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-white/10 bg-white px-5 text-sm font-medium text-[#202124] transition hover:bg-[#f7f7f7] disabled:cursor-not-allowed"
      onClick={() =>
        void signIn("google", { callbackUrl: "/" }, { prompt: "select_account" })
      }
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" role="img">
        <path
          fill="#4285F4"
          d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.63v3.01h3.87c2.27-2.09 3.56-5.17 3.56-8.67z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3.01c-1.07.72-2.45 1.15-4.08 1.15-3.14 0-5.79-2.12-6.74-4.96H1.27v3.12A12 12 0 0 0 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.26 14.27a7.2 7.2 0 0 1 0-4.54V6.61H1.27a12 12 0 0 0 0 10.78l3.99-3.12z"
        />
        <path
          fill="#EA4335"
          d="M12 4.77c1.76 0 3.34.61 4.58 1.81l3.43-3.43C17.96 1.16 15.24 0 12 0A12 12 0 0 0 1.27 6.61l3.99 3.12C6.21 6.89 8.86 4.77 12 4.77z"
        />
      </svg>
      Продолжить с Google
    </button>
  );
}
