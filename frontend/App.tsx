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

function App() {
    const { connected, publicKey } = useWallet()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    const [user, setUser] = useState<User | null>(null)
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const [isSubscribeModalOpen, setIsSubscribeModalOpen] = useState(false)
    const { setVisible } = useWalletModal()

    useEffect(() => {
        if (connected && publicKey) {
            UserService.getOrCreateUser(publicKey.toString())
                .then(userData => {
                    setUser(userData)
                })
                .catch(error => {
                    console.error('Failed to get/create user:', error)
                })
        } else {
            setUser(null)
        }
    }, [connected, publicKey])

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

    return (
        <Router>
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
        </Router>
    )
}

export default App 