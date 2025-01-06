import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { SearchBar } from '../Search/SearchBar';
import { useWallet } from '@solana/wallet-adapter-react';
import { ProfileModal } from '../Profile/ProfileModal';

export function Header() {
    const { connected } = useWallet();
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    return (
        <header className="bg-[#232427] border-b border-gray-800">
            <div className="w-full px-4">
                <div className="flex items-center h-16">
                    <div className="flex items-center space-x-4">
                        <Link to="/" className="text-purple-500 font-bold text-xl">
                            Launchpad
                        </Link>
                        <Link to="/market" className="text-gray-300 hover:text-white px-3 py-2 rounded-md">
                            Solana Market
                        </Link>
                        <Link to="/tokenomics-roadmap" className="text-gray-300 hover:text-white px-3 py-2 rounded-md">
                            Tokenomics & Roadmap
                        </Link>
                    </div>

                    <div className="flex-1 flex justify-center">
                        <div className="w-[400px]">
                            <SearchBar />
                        </div>
                    </div>

                    <div className="flex items-center space-x-4">
                        <WalletMultiButton className="!bg-primary hover:!bg-primary-hover transition-colors duration-200" />
                        {connected && (
                            <button
                                onClick={() => setIsProfileOpen(true)}
                                className="text-gray-300 hover:text-white px-3 py-2 rounded-md"
                            >
                                Profile
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <ProfileModal
                isOpen={isProfileOpen}
                onClose={() => setIsProfileOpen(false)}
            />
        </header>
    );
} 