import { useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect } from 'react';

export function useSubscription() {
    const { publicKey } = useWallet();
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!publicKey) {
            setIsSubscribed(false);
            setIsLoading(false);
            return;
        }

        // Fetch subscription status from your backend
        async function checkSubscription() {
            try {
                const response = await fetch(`/api/subscription/${publicKey?.toString()}`);
                const data = await response.json();
                setIsSubscribed(data.isSubscribed);
            } catch (error) {
                console.error('Error checking subscription:', error);
                setIsSubscribed(false);
            } finally {
                setIsLoading(false);
            }
        }

        checkSubscription();
    }, [publicKey]);

    return { isSubscribed, isLoading };
} 