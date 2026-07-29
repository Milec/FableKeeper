"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Global client-side providers: dark-mode-first theming (next-themes) and the
 * TanStack Query cache. Mounted once in the root layout.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // One QueryClient per browser session; created lazily so it is stable across
  // re-renders but never shared between requests on the server.
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </NextThemesProvider>
    </QueryClientProvider>
  );
}
