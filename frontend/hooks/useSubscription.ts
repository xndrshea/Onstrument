import { useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect } from 'react';

export function useSubscription() {
    const { publicKey } = useWallet();
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function checkSubscription() {
            try {
                if (publicKey) {
                    const response = await fetch(`/api/subscription/${publicKey.toString()}`);
                    const data = await response.json();
                    setIsSubscribed(data.isSubscribed);
                } else {
                    setIsSubscribed(false);
                }
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