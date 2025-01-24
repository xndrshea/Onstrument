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
            <div className="max-w-7xl mx-auto px-4 relative">
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

                        <div className="flex space-x-1">
                            <a
                                href="https://x.com/Onstrument"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-2 text-gray-300 hover:text-white transition-colors duration-200"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                </svg>
                            </a>
                            <a
                                href="https://t.me/Onstrument"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-2 text-gray-300 hover:text-white transition-colors duration-200"
                            >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .24z" />
                                </svg>
                            </a>
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