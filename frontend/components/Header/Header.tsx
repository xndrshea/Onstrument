import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SearchBar } from '../Search/SearchBar';
import { useSubscription } from '../../hooks/useSubscription';
import { SubscribeModal } from '../Subscription/SubscribeModal';
import { useAuth } from '../../hooks/useAuthQuery';
import { Wallet } from '../Wallet';

interface HeaderProps {
    onProfileClick: () => void;
    onSubscribeClick: () => void;
    isSubscribed: boolean;
}

export function Header({ onProfileClick, onSubscribeClick, isSubscribed }: HeaderProps) {
    const { isLoading } = useSubscription();
    const { logout } = useAuth();
    const [isSubscribeModalOpen, setIsSubscribeModalOpen] = useState(false);

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
                        {!isSubscribed && (
                            <button
                                onClick={onSubscribeClick}
                                className="bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600 transition-colors duration-200 rounded-lg px-4 py-2 text-sm font-medium text-white"
                            >
                                Subscribe
                            </button>
                        )}
                        <Wallet onProfileClick={onProfileClick} />
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