import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuthQuery';
import { useNavigate } from 'react-router-dom';

export function Wallet({ onProfileClick }: { onProfileClick: () => void }) {
    const { connected, publicKey, disconnect, wallet } = useWallet();
    const { setVisible } = useWalletModal();
    const { isAuthenticated, isLoading, logout } = useAuth();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        // Debug log to see wallet info
        console.log('Wallet info:', {
            name: wallet?.adapter?.name,
            isPhantom: wallet?.adapter?.name === 'Phantom',
            wallet
        });
    }, [wallet]);

    const handleConnect = () => {
        setVisible(true);
    };

    const handleDisconnect = async () => {
        await logout();
        await disconnect();
        setIsDropdownOpen(false);
    };

    const handleViewProfile = () => {
        onProfileClick();
        setIsDropdownOpen(false);
    };

    if (isLoading) {
        return (
            <div className="bg-blue-500 text-white text-sm rounded-lg px-4 py-2">
                Loading...
            </div>
        );
    }

    if (!connected || !publicKey) {
        return (
            <button
                onClick={handleConnect}
                className="bg-blue-500 hover:bg-blue-600 transition-colors duration-200 rounded-lg px-4 py-2 text-sm font-medium text-white"
            >
                Connect Wallet
            </button>
        );
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="bg-blue-500 hover:bg-blue-600 transition-colors duration-200 rounded-lg px-4 py-2 text-sm font-medium text-white flex items-center gap-2"
            >
                <span>
                    {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
                </span>
                <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-[#1C1D21] ring-1 ring-black ring-opacity-5">
                    <div className="py-1" role="menu">
                        <button
                            onClick={handleViewProfile}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
                            role="menuitem"
                        >
                            View Profile
                        </button>
                        <button
                            onClick={handleDisconnect}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
                            role="menuitem"
                        >
                            Disconnect
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
