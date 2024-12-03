import React, { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { TokenCreationForm } from './components/TokenCreation/TokenCreationForm'
import { TokenList } from './components/TokenList/TokenList'
import { Modal } from './components/Modal/Modal'
import Roadmap from './components/Roadmap/Roadmap'
import { Footer } from './components/Footer/Footer'

function App() {
    const { connected, publicKey } = useWallet()
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [refreshTrigger, setRefreshTrigger] = useState(0)

    const handleCreateClick = () => {
        if (!connected) {
            alert('Please connect your wallet to create a token')
            return
        }
        setIsModalOpen(true)
    }

    return (
        <Router>
            <div style={{
                minHeight: '100vh',
                backgroundColor: '#1a1b1f',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <nav style={{
                    padding: '20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: '#232427'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                        <Link to="/" style={{ textDecoration: 'none' }}>
                            <h1 style={{ color: 'white', cursor: 'pointer' }}>Solana Token Launchpad</h1>
                        </Link>
                        <Link to="/tokenomics" style={{
                            textDecoration: 'none',
                            color: 'white',
                            fontSize: '1rem'
                        }}>
                            Tokenomics
                        </Link>
                        <Link to="/roadmap" style={{
                            textDecoration: 'none',
                            color: 'white',
                            fontSize: '1rem'
                        }}>
                            Roadmap
                        </Link>
                    </div>
                    <WalletMultiButton />
                </nav>

                <main style={{ padding: '20px', color: 'white', flex: 1 }}>
                    <Routes>
                        <Route path="/" element={
                            <>
                                {connected && (
                                    <div className="wallet-info">
                                        <p>✅ Wallet Connected</p>
                                        <p>Address: {publicKey?.toString()}</p>
                                    </div>
                                )}
                                <TokenList
                                    onCreateClick={handleCreateClick}
                                    key={refreshTrigger}
                                />
                            </>
                        } />
                        <Route path="/roadmap" element={<Roadmap />} />
                    </Routes>
                </main>

                <Footer />

                {isModalOpen && !connected ? (
                    <Modal isOpen={true} onClose={() => setIsModalOpen(false)}>
                        <div className="connect-wallet-prompt" style={{ padding: '20px', textAlign: 'center' }}>
                            <h2>Connect Wallet Required</h2>
                            <p>Please connect your wallet to create a token.</p>
                            <WalletMultiButton />
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
            </div>
        </Router>
    )
}

export default App 