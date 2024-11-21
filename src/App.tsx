import React, { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { TokenCreationForm } from './components/TokenCreation/TokenCreationForm'
import { TokenList } from './components/TokenList/TokenList'
import { Modal } from './components/Modal/Modal'

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
        <div style={{ minHeight: '100vh', backgroundColor: '#1a1b1f' }}>
            <nav style={{
                padding: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#232427'
            }}>
                <h1 style={{ color: 'white' }}>Solana Token Launchpad</h1>
                <WalletMultiButton />
            </nav>

            <main style={{ padding: '20px', color: 'white' }}>
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
            </main>
        </div>
    )
}

export default App 