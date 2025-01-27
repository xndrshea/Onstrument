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
import { getFullHeaders } from './utils/headers'

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

    // First useEffect: Check authentication status on mount
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const headers = await getFullHeaders();
                // Change verify-token to verify
                const response = await fetch('/api/auth/verify', {
                    method: 'POST',  // Change to POST since that's what your endpoint expects
                    credentials: 'include',
                    headers,
                    body: JSON.stringify({}) // Empty body since verify endpoint expects POST
                });
                setIsAuthenticated(response.ok);
            } catch (error) {
                console.error('Auth check failed:', error);
                setIsAuthenticated(false);
            }
        };
        checkAuth();
    }, []);

    // Second useEffect: Handle user data and authentication
    useEffect(() => {
        const initializeUser = async () => {
            if (authInProgress || !connected || !publicKey) return;

            try {
                setAuthInProgress(true);

                // Get CSRF token first
                const csrfResponse = await fetch('/api/csrf-token', {
                    credentials: 'include'
                });
                const { csrfToken } = await csrfResponse.json();

                // Add CSRF token to headers
                const headers = {
                    ...await getFullHeaders(),
                    'X-CSRF-Token': csrfToken
                };

                // If already authenticated, just get user data
                if (isAuthenticated) {
                    const userData = await UserService.getOrCreateUser(publicKey.toString());
                    setUser(userData);
                    return;
                }

                // Only proceed with full auth flow if not authenticated
                const nonceResponse = await fetch('/api/auth/nonce', {
                    method: 'POST',
                    headers,
                    credentials: 'include',
                    body: JSON.stringify({ walletAddress: publicKey.toString() })
                });

                if (!nonceResponse.ok) {
                    throw new Error('Failed to get nonce');
                }

                const nonceData = await nonceResponse.json();

                if (!signMessage) {
                    throw new Error('Wallet does not support message signing');
                }

                const message = new TextEncoder().encode(
                    `Sign this message to verify your wallet ownership. Nonce: ${nonceData.nonce}`
                );

                const signature = await signMessage(message);

                if (!signature) {
                    throw new Error('No signature received');
                }

                const verifyHeaders = Object.fromEntries(
                    Object.entries(await getFullHeaders())
                ) as Record<string, string>;
                const verifyResponse = await fetch('/api/auth/verify', {
                    method: 'POST',
                    headers: verifyHeaders,
                    credentials: 'include',
                    body: JSON.stringify({
                        signature: bs58.encode(signature),
                        walletAddress: publicKey.toString(),
                        nonce: nonceData.nonce
                    })
                });

                if (!verifyResponse.ok) {
                    const errorText = await verifyResponse.text();
                    throw new Error(`Failed to verify signature: ${errorText}`);
                }

                setIsAuthenticated(true);
                const userData = await UserService.getOrCreateUser(publicKey.toString());
                setUser(userData);

            } catch (error) {
                console.error('Initialization failed:', error);
                setUser(null);
                setIsAuthenticated(false);
            } finally {
                setAuthInProgress(false);
            }
        };

        initializeUser();
    }, [connected, publicKey, signMessage, isAuthenticated]);

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
            <AuthContext.Provider value={contextValue}>
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