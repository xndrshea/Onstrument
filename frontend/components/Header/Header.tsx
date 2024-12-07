import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const navigation = [
    { name: 'Home', href: '/' },
    { name: 'Market', href: '/market' },
    { name: 'Roadmap', href: '/roadmap' }
];

export function Header() {
    const location = useLocation();

    return (
        <header className="bg-dark-lighter border-b border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <div className="flex items-center">
                        <Link to="/" className="flex items-center space-x-2">
                            <span className="text-2xl font-bold bg-gradient-to-r from-purple-500 to-blue-500 text-transparent bg-clip-text">
                                Launchpad
                            </span>
                        </Link>
                        <nav className="hidden md:ml-8 md:flex md:space-x-4">
                            {navigation.map((item) => (
                                <Link
                                    key={item.name}
                                    to={item.href}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 ease-in-out
                                        ${location.pathname === item.href
                                            ? 'bg-primary text-white'
                                            : 'text-gray-300 hover:bg-primary/10 hover:text-white'
                                        }`}
                                >
                                    {item.name}
                                </Link>
                            ))}
                        </nav>
                    </div>

                    <div className="flex items-center space-x-4">
                        <WalletMultiButton className="!bg-primary hover:!bg-primary-hover transition-colors duration-200" />
                    </div>
                </div>
            </div>
        </header>
    );
} 