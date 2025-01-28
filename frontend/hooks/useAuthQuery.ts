import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserService } from '../services/userService';
import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useRef } from 'react';

let globalAuthInProgress = false;

export function useAuth() {
    const { publicKey, signMessage, connected } = useWallet();
    const queryClient = useQueryClient();

    // Reset auth state when wallet changes
    useEffect(() => {
        queryClient.setQueryData(['auth', publicKey?.toString()], null);
        queryClient.clear();
        globalAuthInProgress = false;
    }, [publicKey, queryClient]);

    const { data: user, isLoading } = useQuery({
        queryKey: ['auth'],
        queryFn: async ({ signal }) => {
            if (!publicKey || !signMessage || globalAuthInProgress) return null;

            try {
                globalAuthInProgress = true;
                // Abort previous requests if still pending
                const controller = new AbortController();
                signal?.addEventListener('abort', () => controller.abort());

                const hasValidSession = await UserService.silentAuthCheck(publicKey.toString());
                if (hasValidSession) {
                    return await UserService.getUser(publicKey.toString());
                }

                return await UserService.authenticate(publicKey, signMessage, controller);
            } finally {
                globalAuthInProgress = false;
            }
        },
        retryDelay: 1000,
        retry: (failureCount, error) => {
            return failureCount < 2 && !(error instanceof DOMException);
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 30 * 60 * 1000,   // 30 minutes (formerly cacheTime)
        refetchOnWindowFocus: false,
        enabled: !!publicKey && !!connected && !!signMessage
    });

    return {
        user: user || null,
        isAuthenticated: !!user,
        isLoading,
        logout: async () => {
            await UserService.logout();
            queryClient.setQueryData(['auth', publicKey?.toString()], null);
            globalAuthInProgress = false;
        }
    };
} 