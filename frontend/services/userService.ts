import { getAuthHeaders, getCsrfHeaders, getFullHeaders } from '../utils/headers';

export interface User {
    userId: string;
    walletAddress: string;
    isSubscribed: boolean;
    subscriptionExpiresAt: string | null;
    subscriptionTier: string | null;
    goldenPoints: number;
    createdAt: string;
    lastSeen: string;
}

interface SubscriptionActivation {
    walletAddress: string;
    durationMonths: number;
    paymentTxId: string;
    tierType: string;
    amountPaid: number;
    goldenPoints: number;
}

export class UserService {
    static async getOrCreateUser(walletAddress: string): Promise<User> {
        try {
            const { headers: authHeaders } = await getAuthHeaders();
            const csrfHeaders = await getCsrfHeaders();
            const response = await fetch(`/api/users`, {
                method: 'POST',
                headers: {
                    ...authHeaders,
                    ...csrfHeaders
                },
                credentials: 'include',
                body: JSON.stringify({ walletAddress })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('User service error:', errorText);
                throw new Error('Failed to get/create user');
            }

            const data = await response.json();
            return {
                userId: data.user_id,
                walletAddress: data.wallet_address,
                isSubscribed: data.is_subscribed,
                subscriptionExpiresAt: data.subscription_expires_at,
                subscriptionTier: data.subscription_tier,
                goldenPoints: data.golden_points,
                createdAt: data.created_at,
                lastSeen: data.last_seen
            };
        } catch (error) {
            console.error('Error in getOrCreateUser:', error);
            throw error;
        }
    }

    static async getUser(walletAddress: string): Promise<User | null> {
        try {
            const response = await fetch(`/api/users/${walletAddress}`, {
                headers: await getFullHeaders(),
                credentials: 'include'
            });

            if (response.status === 404) {
                return null;
            }

            if (!response.ok) {
                throw new Error('Failed to fetch user');
            }

            const data = await response.json();
            return {
                userId: data.user_id,
                walletAddress: data.wallet_address,
                isSubscribed: data.is_subscribed,
                subscriptionExpiresAt: data.subscription_expires_at,
                subscriptionTier: data.subscription_tier,
                goldenPoints: data.golden_points,
                createdAt: data.created_at,
                lastSeen: data.last_seen
            };
        } catch (error) {
            console.error('Error in getUser:', error);
            throw error;
        }
    }

    static async toggleSubscription(walletAddress: string): Promise<User> {
        try {
            const { headers: authHeaders } = await getAuthHeaders();
            const csrfHeaders = await getCsrfHeaders();

            const response = await fetch(`/api/users/${walletAddress}/toggle-subscription`, {
                method: 'POST',
                headers: {
                    ...authHeaders,
                    ...csrfHeaders,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Failed to toggle subscription');
            }

            const data = await response.json();
            return {
                userId: data.user_id,
                walletAddress: data.wallet_address,
                isSubscribed: data.is_subscribed,
                subscriptionExpiresAt: data.subscription_expires_at,
                subscriptionTier: data.subscription_tier,
                goldenPoints: data.golden_points,
                createdAt: data.created_at,
                lastSeen: data.last_seen
            };
        } catch (error) {
            console.error('Error in toggleSubscription:', error);
            throw error;
        }
    }

    static async activateSubscription(params: SubscriptionActivation): Promise<User> {
        try {
            const { headers: authHeaders } = await getAuthHeaders();
            const csrfHeaders = await getCsrfHeaders();

            const response = await fetch(`/api/users/${params.walletAddress}/activate-subscription`, {
                method: 'POST',
                headers: {
                    ...authHeaders,
                    ...csrfHeaders,
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(params)
            });

            if (!response.ok) {
                throw new Error('Failed to activate subscription');
            }

            return await response.json();
        } catch (error) {
            console.error('Error in activateSubscription:', error);
            throw error;
        }
    }
}
