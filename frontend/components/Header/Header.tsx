import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { SearchBar } from '../Search/SearchBar';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useSubscription } from '../../hooks/useSubscription';
import { SubscribeModal } from '../Subscription/SubscribeModal';

interface HeaderProps {
    onProfileClick: () => void;
    onSubscribeClick: () => void;
}

export function Header({ onProfileClick, onSubscribeClick }: HeaderProps) {
    const { connected, publicKey, disconnect } = useWallet();
    const { setVisible } = useWalletModal();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { isSubscribed, isLoading } = useSubscription();
    const [isSubscribeModalOpen, setIsSubscribeModalOpen] = useState(false);


    // Handle clicking outside of dropdown to close it
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleConnect = () => {
        setVisible(true); // This opens the wallet modal
    };

    const handleDisconnect = async () => {
        await disconnect();
        setIsDropdownOpen(false);
    };

    return (
        <header className="bg-[#1C1D21] border-b border-blue-500/20 backdrop-blur-sm sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center space-x-8">
                        <Link
                            to="/"
                            className="text-blue-400 font-bold text-xl tracking-tight hover:text-violet-400 transition-colors"
                        >
                            Onstrument
                        </Link>
                        <nav className="hidden md:flex space-x-1">
                            <Link
                                to="/market"
                                className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all duration-200"
                            >
                                Solana
                            </Link>
                            <Link
                                to="/tokenomics-roadmap"
                                className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all duration-200"
                            >
                                Tokenomics & Roadmap
                            </Link>
                        </nav>
                    </div>

                    <div className="flex-1 max-w-md mx-8">
                        <SearchBar />
                    </div>

                    <div className="flex items-center space-x-4">
                        {/* Show Subscribe button regardless of connection status */}
                        {!isLoading && !isSubscribed && (
                            <button
                                onClick={onSubscribeClick}
                                className="bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600 transition-colors duration-200 rounded-lg px-4 py-2 text-sm font-medium text-white"
                            >
                                Subscribe
                            </button>
                        )}

                        <div className="relative" ref={dropdownRef}>
                            {!connected ? (
                                <button
                                    onClick={handleConnect}
                                    className="bg-purple-600 hover:bg-purple-700 transition-colors duration-200 rounded-lg px-4 py-2 text-sm font-medium text-white"
                                >
                                    Connect Wallet
                                </button>
                            ) : (
                                <button
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 transition-colors duration-200 rounded-lg px-4 py-2 text-sm font-medium text-white"
                                >
                                    <span>{publicKey?.toString().slice(0, 4)}...{publicKey?.toString().slice(-4)}</span>
                                    <svg
                                        className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                            )}

                            {isDropdownOpen && connected && (
                                <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-[#232427] ring-1 ring-black ring-opacity-5">
                                    <div className="py-1" role="menu">
                                        <button
                                            onClick={() => {
                                                onProfileClick();
                                                setIsDropdownOpen(false);
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800/50"
                                            role="menuitem"
                                        >
                                            View Profile
                                        </button>
                                        <button
                                            onClick={handleConnect}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800/50"
                                            role="menuitem"
                                        >
                                            Change Wallet
                                        </button>
                                        <button
                                            onClick={handleDisconnect}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800/50"
                                            role="menuitem"
                                        >
                                            Disconnect
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {isSubscribeModalOpen && (
                <SubscribeModal
                    isOpen={isSubscribeModalOpen}
                    onClose={() => setIsSubscribeModalOpen(false)}
                />
            )}
        </header>
    );
} 