import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SearchBar } from '../Search/SearchBar';
import { useSubscription } from '../../hooks/useSubscription';
import { SubscribeModal } from '../Subscription/SubscribeModal';
import { useAuth } from '../../hooks/useAuthQuery';
import { Wallet } from '../Wallet';
import { LiveTradesDisplay } from './LiveTradesDisplay';
import { LiveCreationsDisplay } from './LiveCreationsDisplay';

interface HeaderProps {
    onProfileClick: () => void;
    onSubscribeClick: () => void;
    isSubscribed: boolean;
}

export function Header({ onProfileClick, onSubscribeClick, isSubscribed }: HeaderProps) {
    const { isLoading } = useSubscription();
    const { logout } = useAuth();
    const [isSubscribeModalOpen, setIsSubscribeModalOpen] = useState(false);
    const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                setShowFeedbackPopup(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
            <div className="w-full px-4 sm:px-6 lg:px-8 relative">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center space-x-8">
                        <Link
                            to="/"
                            className="text-blue-600 font-bold text-xl tracking-tight hover:text-violet-600 transition-colors"
                        >
                            Onstrument
                        </Link>
                        <nav className="hidden md:flex space-x-1">
                            <Link
                                to="/market"
                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200"
                            >
                                Solana
                            </Link>
                            <Link
                                to="/tokenomics-roadmap"
                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200"
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
                <div className="flex items-center overflow-x-auto hide-scrollbar">
                    <LiveCreationsDisplay />
                    <LiveTradesDisplay />
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