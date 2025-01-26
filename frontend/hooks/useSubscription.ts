import { useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

interface SubscriptionStatus {
    isSubscribed: boolean;
    isExpired: boolean;
    expiresAt: string | null;
    tier: string | null;
}

export function useSubscription() {
    const { publicKey } = useWallet();
    const [status, setStatus] = useState<SubscriptionStatus>({
        isSubscribed: false,
        isExpired: false,
        expiresAt: null,
        tier: null
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function checkSubscription() {
            try {
                if (publicKey) {
                    const response = await fetch(
                        `/api/users/${publicKey.toString()}/check-subscription`,
                        { method: 'POST' }
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
                } else {
                    setStatus({
                        isSubscribed: false,
                        isExpired: false,
                        expiresAt: null,
                        tier: null
                    });
                }
            } catch (error) {
                console.error('Error checking subscription:', error);
                setStatus({
                    isSubscribed: false,
                    isExpired: false,
                    expiresAt: null,
                    tier: null
                });
            } finally {
                setIsLoading(false);
            }
        }

        checkSubscription();

        // Check subscription status every hour
        const interval = setInterval(checkSubscription, 60 * 60 * 1000);

        return () => clearInterval(interval);
    }, [publicKey]);

    return { ...status, isLoading };
} 