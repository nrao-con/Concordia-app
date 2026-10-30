import { useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { unsubscribeFromPush } from "@/hooks/use-notifications";
import { authenticatedFetch } from "@/lib/queryClient";

export type AuthUser = User & { isAdmin?: boolean; pharmacyAccess?: boolean };

export class AuthUserError extends Error {
  constructor(
    public status: number,
    public details: {
      error?: string;
      message?: string;
      caseNumber?: string | null;
      staffReviewAvailable?: boolean;
      requestState?: string;
      linkRequest?: {
        status: string;
        requestedAt?: string;
        reviewedAt?: string;
        rejectionReason?: string | null;
        createdAt?: string;
        updatedAt?: string;
      } | null;
    },
  ) {
    super(details.message || `[auth] /api/auth/user returned ${status}`);
  }
}

async function fetchDbUser(): Promise<AuthUser> {
  const res = await authenticatedFetch("/api/auth/user");
  if (!res.ok) {
    const details = await res.json().catch(() => ({}));
    throw new AuthUserError(res.status, details);
  }
  return res.json();
}

export function useAuth() {
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const clerkUserId = clerkUser?.id;
  const { data: user, isLoading: isUserLoading, error: authError, refetch } = useQuery<AuthUser, AuthUserError>({
    queryKey: ["/api/auth/user", clerkUserId],
    queryFn: fetchDbUser,
    enabled: isLoaded && !!clerkUserId,
    retry: (failureCount, error) => error.status === 401 && failureCount < 3,
    // A 423 account hold renders a screen that also observes this query.
    // Re-fetching on that observer's mount would unmount/remount the screen
    // indefinitely. Manual refetch remains available through retryAuth.
    retryOnMount: false,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 2000),
    staleTime: 1000 * 60 * 5,
  });

  const logout = async () => {
    setIsLoggingOut(true);
    await unsubscribeFromPush();
    queryClient.clear();
    signOut({ redirectUrl: "/" }).catch(() => {
      window.location.replace("/");
    });
  };

  const isLoading = !isLoaded || (!!clerkUser && isUserLoading);
  const resolvedUser = clerkUser ? (user ?? null) : null;

  return {
    user: resolvedUser as AuthUser | null | undefined,
    isLoading,
    isAuthenticated: !!clerkUser && !!user,
    authError,
    retryAuth: refetch,
    logout,
    isLoggingOut,
  };
}
