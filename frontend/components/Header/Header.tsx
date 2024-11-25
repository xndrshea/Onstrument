import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const navigation = [
    { name: 'Home', href: '/' },
    { name: 'Tokens', href: '/tokens' },
    { name: 'Tokenomics', href: '/tokenomics' },
    { name: 'Roadmap', href: '/roadmap' }
];

export function Header() {
    const location = useLocation();

    return (
        <header className="bg-gray-800">
            <nav className="container mx-auto px-4">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <Link to="/" className="text-white font-bold text-xl">
                            Token Platform
                        </Link>
                    </div>
                    <div className="flex space-x-4">
                        {navigation.map((item) => (
                            <Link
                                key={item.name}
                                to={item.href}
                                className={`px-3 py-2 rounded-md text-sm font-medium ${location.pathname === item.href
                                        ? 'bg-gray-900 text-white'
                                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                    }`}
                            >
                                {item.name}
                            </Link>
                        ))}
                    </div>
                </div>
            </nav>
        </header>
    );
} 