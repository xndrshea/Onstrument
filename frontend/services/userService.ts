import { getAuthHeaders, getCsrfHeaders, getFullHeaders } from '../utils/headers';
import { getEnvironment } from '../config';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { MessageSignerWalletAdapter } from '@solana/wallet-adapter-base';

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
            const csrfHeaders = await getCsrfHeaders();

            const response = await fetch(`/api/users`, {
                method: 'POST',
                headers: {
                    ...(await getFullHeaders()),
                    ...csrfHeaders,
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ walletAddress })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.error || await response.text();
                console.error('User service error:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorMessage
                });
                throw new Error(`Failed to get/create user: ${response.status} ${errorMessage}`);
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

    static async getUser(walletAddress: string, controller?: AbortController): Promise<User> {
        try {
            const response = await fetch(`/api/users/${walletAddress}`, {
                headers: {
                    'Accept': 'application/json',
                    ...(await getFullHeaders())
                },
                credentials: 'include',
                signal: controller?.signal
            });

            // Validate response format
            const contentType = response.headers.get('content-type');
            if (!contentType?.includes('application/json')) {
                const text = await response.text();
                throw new Error(`Invalid response: ${text.slice(0, 100)}`);
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
            const headers = await getFullHeaders();
            const csrfHeaders = await getCsrfHeaders();

            const response = await fetch(`/api/users/${walletAddress}/toggle-subscription`, {
                method: 'POST',
                headers: {
                    ...headers,
                    ...csrfHeaders,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.error || await response.text();
                throw new Error(`Failed to toggle subscription: ${errorMessage}`);
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
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.error || await response.text();
                console.error('Subscription activation error:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorMessage
                });
                throw new Error(`Failed to activate subscription: ${errorMessage}`);
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
            console.error('Error in activateSubscription:', error);
            throw error;
        }
    }

    static async logout(): Promise<void> {
        const env = getEnvironment();
        try {
            // Call server logout FIRST
            const { headers, credentials } = await getAuthHeaders();
            await fetch(`${env.base}/api/auth/logout`, {
                method: 'POST',
                headers,
                credentials
            });

            // Then clear cookies
            document.cookie = `authToken=; path=/; max-age=0`;
            if (process.env.NODE_ENV === 'production') {
                document.cookie = `authToken=; path=/; domain=.onstrument.com; max-age=0`;
            }
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    static async authenticate(publicKey: PublicKey, signMessage: MessageSignerWalletAdapter['signMessage'], controller?: AbortController) {
        try {
            const env = getEnvironment();
            const headers = await getFullHeaders();

            const nonceResponse = await fetch(`${env.base}/api/auth/nonce`, {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({ walletAddress: publicKey.toString() }),
                signal: controller?.signal
            });

            if (!nonceResponse.ok) {
                throw new Error('Failed to get nonce');
            }

            const { nonce } = await nonceResponse.json();

            // Add delay to prevent rapid re-requests
            await new Promise(resolve => setTimeout(resolve, 500));

            const message = new TextEncoder().encode(`Sign this message to verify your wallet ownership. Nonce: ${nonce}`);
            const signedMessage = await signMessage(message);
            const signature = bs58.encode(signedMessage);

            const verifyResponse = await fetch(`${env.base}/api/auth/verify`, {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({
                    walletAddress: publicKey.toString(),
                    signature,
                    nonce
                }),
                signal: controller?.signal
            });

            if (!verifyResponse.ok) {
                throw new Error('Failed to verify signature');
            }

            return verifyResponse.json();
        } catch (error) {
            // Don't log AbortError as it's expected behavior
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw error; // Re-throw to be handled by React Query
            }
            console.error('Authentication error:', error);
            throw error;
        }
    }

    static async silentAuthCheck(walletAddress: string, controller?: AbortController): Promise<boolean> {
        try {
            const response = await fetch(`/api/auth/verify-silent?wallet=${walletAddress}`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Cache-Control': 'no-cache'
                },
                signal: controller?.signal
            });

            if (response.status === 401) {
                await UserService.logout();
                return false;
            }

            const { valid } = await response.json();
            return valid;
        } catch (error) {
            // Don't treat AbortError as an error
            if (error instanceof DOMException && error.name === 'AbortError') {
                return false;
            }
            return false;
        }
    }
}
