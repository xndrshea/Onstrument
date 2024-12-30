import { API_BASE_URL } from "../config";

export interface User {
    userId: string;
    walletAddress: string;
    isSubscribed: boolean;
    subscriptionExpiresAt?: string;
    createdAt: string;
    lastSeen: string;
}

export class UserService {
    static async getOrCreateUser(walletAddress: string): Promise<User> {
        try {
            const response = await fetch(`${API_BASE_URL}/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ walletAddress })
            });

            if (!response.ok) {
                throw new Error('Failed to get/create user');
            }

            const data = await response.json();
            return {
                userId: data.user_id,
                walletAddress: data.wallet_address,
                isSubscribed: data.is_subscribed,
                subscriptionExpiresAt: data.subscription_expires_at,
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
            const response = await fetch(`${API_BASE_URL}/users/${walletAddress}`);

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
                createdAt: data.created_at,
                lastSeen: data.last_seen
            };
        } catch (error) {
            console.error('Error in getUser:', error);
            throw error;
        }
    }
}
