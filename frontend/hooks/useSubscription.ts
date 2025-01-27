import { useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect, useContext } from 'react';
import { toast } from 'react-hot-toast';
import { AuthContext } from '../contexts/AuthContext';
import { getAuthHeaders, getFullHeaders } from '../utils/headers';

interface SubscriptionStatus {
    isSubscribed: boolean;
    isExpired: boolean;
    expiresAt: string | null;
    tier: string | null;
}

export function useSubscription() {
    const { publicKey } = useWallet();
    const { isAuthenticated, authCompleted } = useContext(AuthContext);
    const [status, setStatus] = useState<SubscriptionStatus>({
        isSubscribed: false,
        isExpired: false,
        expiresAt: null,
        tier: null
    });
    const [isLoading, setIsLoading] = useState(true);

    const checkSubscription = async () => {
        if (!publicKey || !authCompleted) return; // Wait for auth

        try {
            const response = await fetch(
                `/api/users/${publicKey.toString()}/check-subscription`,
                {
                    method: 'POST',
                    headers: await getFullHeaders(),
                    credentials: 'include'
                }
            );
            const data = await response.json();
            setStatus(data);

            // Notify user if subscription is expired
            if (data.isExpired) {
                toast.error(
                    'Your subscription has expired. Please renew to continue accessing premium features.',
                    { duration: 5000 }
                );
            }

            // Notify user if subscription is about to expire
            else if (data.expiresAt) {
                const daysUntilExpiry = Math.ceil(
                    (new Date(data.expiresAt).getTime() - new Date().getTime())
                    / (1000 * 60 * 60 * 24)
                );

                if (daysUntilExpiry <= 7) {
                    toast(`Your subscription will expire in ${daysUntilExpiry} days. Please renew soon.`, {
                        duration: 5000,
                        icon: '⚠️'
                    });
                }
            }
        } catch (error) {
            console.error('Subscription check failed:', error);
            setStatus({
                isSubscribed: false,
                isExpired: false,
                expiresAt: null,
                tier: null
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        checkSubscription();
    }, [publicKey, isAuthenticated, authCompleted]);

    return { ...status, isLoading };
} 