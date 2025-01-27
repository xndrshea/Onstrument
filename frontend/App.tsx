import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { Modal } from './components/Modal/Modal'
import TokenomicsRoadmap from './components/TokenomicsRoadmap/TokenomicsRoadmap'
import { Footer } from './components/Footer/Footer'
import { TokenDetailsPage } from './components/pages/TokenDetailsPage'
import { MarketPage } from './components/pages/MarketPage'
import { Header } from './components/Header/Header'
import { UserService } from './services/userService'
import { User } from './services/userService'
import { ProfileModal } from './components/Profile/ProfileModal'
import { ProfilePage } from './components/pages/ProfilePage'
import { SubscribeModal } from './components/Subscription/SubscribeModal'
import { PrivacyPolicy } from './components/pages/PrivacyPolicy'
import { TermsOfService } from './components/pages/TermsOfService'
import { TokenCreationForm } from './components/TokenCreation/TokenCreationForm'
import { TokenList } from './components/TokenList/TokenList'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import bs58 from 'bs58'
import { AuthContext } from './contexts/AuthContext'
import { getFullHeaders, getAuthHeaders } from './utils/headers'

function App() {
    const { connected, publicKey, signMessage } = useWallet()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [user, setUser] = useState<User | null>(null)
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const [isSubscribeModalOpen, setIsSubscribeModalOpen] = useState(false)
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [authInProgress, setAuthInProgress] = useState(false)
    const { setVisible } = useWalletModal()
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    const [authCompleted, setAuthCompleted] = useState(false)

    useEffect(() => {
        const checkPersistedAuth = async () => {
            try {
                // If no publicKey, don't even try
                if (!publicKey) return false;

                // First try to get/create user without auth
                const createUserResponse = await fetch('/api/users', {
                    method: 'POST',
                    headers: await getFullHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({ walletAddress: publicKey.toString() })
                });

                if (!createUserResponse.ok) {
                    console.log('Failed to create/get user');
                    return false;
                }

                // Now try the authenticated endpoint
                const { headers } = await getAuthHeaders();
                const response = await fetch(`/api/users/${publicKey.toString()}`, {
                    method: 'GET',
                    headers,
                    credentials: 'include'
                });

                if (response.ok) return true;

                // Check for HTML response
                const text = await response.text();
                if (text.startsWith('<!DOCTYPE')) {
                    throw new Error('Server error - received HTML response');
                }
                return false;
            } catch (error) {
                console.log('Persisted auth check failed:', error);
                return false;
            }
        };

        const forceAuthFlow = async () => {
            try {
                const nonceResponse = await fetch('/api/auth/nonce', {
                    method: 'POST',
                    headers: await getFullHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({ walletAddress: publicKey!.toString() })
                });

                if (!nonceResponse.ok) {
                    throw new Error('Failed to get nonce');
                }

                const nonceData = await nonceResponse.json();
                const message = new TextEncoder().encode(
                    `Sign this message to verify your wallet ownership. Nonce: ${nonceData.nonce}`
                );

                // Show wallet modal immediately
                setVisible(true);

                const signature = await signMessage!(message);
                if (!signature) throw new Error('No signature received');

                const verifyResponse = await fetch('/api/auth/verify', {
                    method: 'POST',
                    headers: await getFullHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({
                        signature: bs58.encode(signature),
                        walletAddress: publicKey!.toString(),
                        nonce: nonceData.nonce
                    })
                });

                if (!verifyResponse.ok) {
                    throw new Error('Verification failed');
                }

                // Update auth state
                const userData = await UserService.getUser(publicKey!.toString());
                setUser(userData);
                setIsAuthenticated(true);
            } catch (error) {
                console.error('Forced auth failed:', error);
                setIsAuthenticated(false);
                setUser(null);
            }
        };

        const initializeAuth = async () => {
            if (!publicKey || !connected) return;

            try {
                setAuthInProgress(true);

                // First try silent auth
                const hasValidSession = await checkPersistedAuth();
                if (hasValidSession) {
                    const userData = await UserService.getUser(publicKey.toString());
                    setUser(userData);
                    setIsAuthenticated(true);
                    setAuthCompleted(true);  // Set completed after successful auth
                    return;
                }

                // If silent auth fails, force signing
                await forceAuthFlow();
                setAuthCompleted(true);  // Set completed after forced auth
            } catch (error) {
                console.error('Auth failed:', error);
                setIsAuthenticated(false);
                setUser(null);
                setAuthCompleted(true);  // Set completed even on failure
            } finally {
                setAuthInProgress(false);
            }
        };

        initializeAuth();
    }, [publicKey, connected, signMessage]);

    const handleCreateClick = () => {
        if (!connected) {
            alert('Please connect your wallet to create a token')
            return
        }
        setIsModalOpen(true)
    }

    const handleSubscribeClick = () => {
        setIsSubscribeModalOpen(true)
    }

    const contextValue = {
        user,
        isAuthenticated,
        setUser,
        logout: () => {
            setUser(null);
            setIsAuthenticated(false);
            document.cookie = 'authToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        },
        refreshUser: async () => {
            if (publicKey) {
                const userData = await UserService.getOrCreateUser(publicKey.toString());
                setUser(userData);
            }
        }
    };

    return (
        <Router>
            <AuthContext.Provider value={{
                ...contextValue,
                authCompleted,
                setIsAuthenticated
            }}>
                <div style={{
                    minHeight: '100vh',
                    backgroundColor: '#1a1b1f',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <Header
                        onProfileClick={() => setIsProfileOpen(true)}
                        onSubscribeClick={handleSubscribeClick}
                    />

                    <main style={{
                        padding: '20px',
                        color: 'white',
                        flex: '1 1 auto',
                        minHeight: 0  // Add this to prevent flex item from growing
                    }}>
                        <Routes>
                            <Route path="/" element={
                                <TokenList
                                    onCreateClick={handleCreateClick}
                                    key={refreshTrigger}
                                />
                            } />
                            <Route path="/market" element={<MarketPage />} />
                            <Route path="/token/:mintAddress" element={<TokenDetailsPage />} />
                            <Route path="/tokenomics-roadmap" element={<TokenomicsRoadmap />} />
                            <Route path="/profile" element={<ProfilePage />} />
                            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                            <Route path="/terms-of-service" element={<TermsOfService />} />
                        </Routes>
                    </main>

                    <Footer />

                    {isModalOpen && !connected ? (
                        <Modal isOpen={true} onClose={() => setIsModalOpen(false)}>
                            <div className="connect-wallet-prompt" style={{ padding: '20px', textAlign: 'center' }}>
                                <h2>Connect Wallet Required</h2>
                                <p>Please connect your wallet to create a token.</p>
                                <button
                                    onClick={() => setVisible(true)}
                                    className="bg-purple-600 hover:bg-purple-700 transition-colors duration-200 rounded-lg px-4 py-2 text-sm font-medium text-white"
                                >
                                    Select Wallet
                                </button>
                            </div>
                        </Modal>
                    ) : (
                        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
                            <TokenCreationForm
                                onSuccess={() => setIsModalOpen(false)}
                                onTokenCreated={() => {
                                    setRefreshTrigger(prev => prev + 1)
                                    setIsModalOpen(false)
                                }}
                            />
                        </Modal>
                    )}

                    {isProfileOpen && (
                        <ProfileModal
                            isOpen={isProfileOpen}
                            onClose={() => setIsProfileOpen(false)}
                        />
                    )}
                    {isSubscribeModalOpen && (
                        <SubscribeModal
                            isOpen={isSubscribeModalOpen}
                            onClose={() => setIsSubscribeModalOpen(false)}
                        />
                    )}
                </div>
            </AuthContext.Provider>
        </Router>
    )
}

export default App 