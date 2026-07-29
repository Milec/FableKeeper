"use client";

import { Button } from "@/components/ui/button";
import { signInWithOAuth } from "./actions";

/** Google + Discord OAuth buttons. */
export function OAuthButtons() {
  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => signInWithOAuth("google")}
      >
        <GoogleIcon />
        Continue with Google
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => signInWithOAuth("discord")}
      >
        <DiscordIcon />
        Continue with Discord
      </Button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.24 10.29v3.7h5.15c-.21 1.34-1.53 3.93-5.15 3.93-3.1 0-5.63-2.57-5.63-5.73s2.53-5.73 5.63-5.73c1.77 0 2.95.75 3.63 1.4l2.47-2.38C16.4 3.62 14.5 2.8 12.24 2.8 7.5 2.8 3.66 6.64 3.66 11.39s3.84 8.59 8.58 8.59c4.95 0 8.23-3.48 8.23-8.38 0-.56-.06-.99-.14-1.42z"
      />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.9a.07.07 0 0 0-.08.03c-.2.38-.44.87-.6 1.25a18.3 18.3 0 0 0-5.45 0 12 12 0 0 0-.61-1.25.08.08 0 0 0-.08-.03A19.7 19.7 0 0 0 3.66 4.37a.06.06 0 0 0-.03.03C.53 9.05-.32 13.6.1 18.1a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.11 13 13 0 0 1-1.87-.9.08.08 0 0 1 0-.13l.37-.29a.07.07 0 0 1 .08-.01 14.2 14.2 0 0 0 12.06 0 .07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1 0 .12c-.6.35-1.22.65-1.87.9a.08.08 0 0 0-.04.11c.36.7.78 1.36 1.23 2a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .04-.05c.5-5.18-.84-9.7-3.55-13.7a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42s.95-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42s.95-2.42 2.15-2.42c1.22 0 2.19 1.1 2.16 2.42 0 1.34-.94 2.42-2.16 2.42Z"
      />
    </svg>
  );
}
