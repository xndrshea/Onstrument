import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { SearchBar } from '../Search/SearchBar';
import { useWallet } from '@solana/wallet-adapter-react';

interface HeaderProps {
    onProfileClick: () => void;
}

export function Header({ onProfileClick }: HeaderProps) {
    const { connected } = useWallet();

    return (
        <header className="bg-[#1A1B1F] border-b border-gray-800/50 backdrop-blur-sm sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center space-x-8">
                        <Link
                            to="/"
                            className="text-purple-400 font-bold text-xl tracking-tight hover:text-purple-300 transition-colors"
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
                        <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 !transition-colors !duration-200 !rounded-lg !px-4 !py-2 !text-sm !font-medium" />
                        {connected && (
                            <button
                                onClick={onProfileClick}
                                className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800/50 rounded-lg transition-all duration-200"
                            >
                                Profile
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
} 