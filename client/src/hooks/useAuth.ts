import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import type { AuthUserOrgFields } from "@shared/userPublic";
import { getQueryFn } from "@/lib/queryClient";

export function useAuth() {
  // User & AuthUserOrgFields, not User: /api/auth/user decorates its response
  // with the caller's school details, which are not `users` columns. Typing them
  // is what removes the `as any` at the call sites — and the cast is what made
  // `!!(user as any)?.isOrgStudent` look safe when it was quietly answering "not
  // a school student" for a user who had not loaded yet.
  const { data: user, isLoading } = useQuery<(User & AuthUserOrgFields) | null>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: 30 * 1000, // 30s — auth state changes are handled by explicit query invalidation
  });

  return {
    user: user ?? undefined,
    isLoading,
    isAuthenticated: !!user,
  };
}
