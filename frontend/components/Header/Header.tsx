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
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ marginLeft: '-120px' }}>
                    <button
                        onClick={() => setShowFeedbackPopup(!showFeedbackPopup)}
                        className="rounded-lg bg-violet-100 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-200 transition-colors"
                    >
                        Feedback!
                    </button>

                    {showFeedbackPopup && (
                        <div
                            ref={popupRef}
                            className="absolute left-0 top-12 bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-64"
                        >
                            <h3 className="text-sm font-semibold text-gray-900 mb-3">Connect with us:</h3>
                            <p className="text-sm text-gray-600 mb-3">Your criticisms are extremely important to us</p>
                            <div className="space-y-2">
                                <a
                                    href="https://t.me/onstrument"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center p-2 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                                >
                                    <div className="w-8 h-8 flex items-center justify-center bg-[#229ED9] rounded-full mr-3">
                                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.223-.535.223l.19-2.712 4.94-4.465c.215-.19-.047-.297-.332-.107l-6.107 3.843-2.332-.725c-.505-.16-.514-.508.11-.754l9.083-3.5c.424-.162.81.102.483 1.225z" />
                                        </svg>
                                    </div>
                                    <span className="text-sm text-gray-700">Telegram</span>
                                </a>
                                <a
                                    href="https://x.com/onstrument"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center p-2 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                                >
                                    <div className="w-8 h-8 flex items-center justify-center bg-black rounded-full mr-3">
                                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                        </svg>
                                    </div>
                                    <span className="text-sm text-gray-700">X (Twitter)</span>
                                </a>
                            </div>
                        </div>
                    )}
                </div>

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
                                to="/projects"
                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200"
                            >
                                Onstrument Projects
                            </Link>
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