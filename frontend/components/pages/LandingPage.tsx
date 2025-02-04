import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { TokenCreationForm } from '../TokenCreation/TokenCreationForm';
import { useState, useEffect } from 'react';
import { Dialog, DialogPanel } from '@headlessui/react';

export function LandingPage() {
    const { connected } = useWallet();
    const { setVisible } = useWalletModal();
    const [showQuickForm, setShowQuickForm] = useState(false);
    const [pendingAction, setPendingAction] = useState<'quickForm' | null>(null);
    const [recentProjects, setRecentProjects] = useState([]);

    const handleQuickStart = () => {
        if (!connected) {
            setPendingAction('quickForm');
            setVisible(true);
        } else {
            setShowQuickForm(true);
        }
    };

    useEffect(() => {
        if (connected && pendingAction === 'quickForm') {
            setShowQuickForm(true);
            setPendingAction(null);
        }
    }, [connected, pendingAction]);

    useEffect(() => {
        const fetchRecentProjects = async () => {
            try {
                const response = await fetch('/api/tokens?sortBy=newest&limit=5');
                const data = await response.json();
                setRecentProjects(data.tokens || []);
            } catch (error) {
                console.error('Failed to fetch recent projects:', error);
            }
        };

        fetchRecentProjects();
    }, []);

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-7xl mx-auto px-4 py-16">
                {/* Hero Section */}
                <div className="text-center mb-16">
                    <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-violet-500 mb-6">
                        For The Builders
                    </h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
                        Our mission is to help bring real projects to life.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-4">
                        <div className="flex flex-col items-center">
                            <button
                                onClick={handleQuickStart}
                                className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-8 py-3.5 text-lg font-medium transition-colors duration-200 shadow-lg border border-blue-400"
                            >
                                Launch Meme
                            </button>
                            <span className="text-sm text-gray-500 italic mt-2">in seconds</span>
                        </div>

                        <div className="flex flex-col items-center">
                            <Link
                                to="/create"
                                className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg px-8 py-3.5 text-lg font-medium transition-colors duration-200 shadow-lg border border-sky-400"
                            >
                                Start Project
                            </Link>
                            <span className="text-sm text-gray-500 italic mt-2">in minutes</span>
                        </div>

                        <div className="flex flex-col items-center">
                            <Link
                                to="/contact"
                                className="inline-flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg px-8 py-3.5 text-lg font-medium transition-colors duration-200 shadow-lg border border-cyan-400"
                            >
                                Custom Tokenomics
                            </Link>
                            <span className="text-sm text-gray-500 italic mt-2">in days to weeks</span>
                        </div>
                    </div>
                </div>

                {showQuickForm && (
                    <Dialog open={showQuickForm} onClose={() => setShowQuickForm(false)} className="relative z-50">
                        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                        <div className="fixed inset-0 flex items-center justify-center p-4">
                            <DialogPanel className="bg-white rounded-lg p-6 w-full max-w-xl">
                                <TokenCreationForm />
                            </DialogPanel>
                        </div>
                    </Dialog>
                )}

                {/* Recent Projects Section */}
                <div className="mb-20">
                    <h2 className="text-3xl font-bold text-center mb-8">Most Recent Projects</h2>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        {recentProjects.slice(0, 5).map((project: any, index: number) => (
                            <Link
                                key={project.mint_address || index}
                                to={`/token/${project.mintAddress}`}
                                state={{ tokenType: 'custom' }}
                                className="bg-gradient-to-br from-blue-50 to-violet-50 p-4 rounded-xl border border-blue-100 hover:border-violet-200 transition-all"
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    {project.image_url && (
                                        <img
                                            src={project.image_url}
                                            alt={project.name}
                                            className="w-8 h-8 rounded-full"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    )}
                                    <h3 className="font-semibold text-gray-900 truncate">
                                        {project.name}
                                    </h3>
                                </div>
                                <p className="text-sm text-gray-600 truncate">
                                    {project.symbol}
                                </p>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* How It Works Section */}
                <div className="mb-20">
                    <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
                    <div className="space-y-4 max-w-4xl mx-auto">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-gradient-to-br from-blue-50 to-violet-50 p-6 rounded-2xl">
                                <div className="text-blue-600 font-bold text-lg mb-2">1. Connect Wallet</div>
                                <p className="text-gray-700">
                                    Connect your Solana wallet.
                                </p>
                            </div>
                            <div className="bg-gradient-to-br from-blue-50 to-violet-50 p-6 rounded-2xl">
                                <div className="text-blue-600 font-bold text-lg mb-2">2. Define Project</div>
                                <p className="text-gray-700">
                                    Choose name, supply, image, etc.
                                </p>
                            </div>
                            <div className="bg-gradient-to-br from-blue-50 to-violet-50 p-6 rounded-2xl">
                                <div className="text-blue-600 font-bold text-lg mb-2">3. Create</div>
                                <p className="text-gray-700">
                                    Launch your token with one click.
                                </p>
                            </div>
                            <div className="bg-gradient-to-br from-blue-50 to-violet-50 p-6 rounded-2xl">
                                <div className="text-blue-600 font-bold text-lg mb-2">4. Build & Trade</div>
                                <p className="text-gray-700">
                                    Start trading and continue building your project.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Our Mission Section */}
                <div className="mb-20">
                    <h2 className="text-3xl font-bold text-center mb-8">Our Mission</h2>
                    <div className="max-w-4xl mx-auto">
                        <p className="text-xl text-gray-600 mb-6">
                            We believe crypto can be a force for good. Onstrument empowers the best creators to bring their
                            real ideas to life.
                        </p>
                        <p className="text-xl text-gray-600 mb-6">
                            We are committed to the builders first and foremost, and will continuously adapt to your needs.
                        </p>
                    </div>
                </div>

                {/* Success Stories */}
                <div className="mb-20">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="bg-white p-6 rounded-xl border border-blue-200 hover:border-violet-300 transition-all">
                            <h3 className="font-semibold text-gray-900 mb-2">Easy Launch</h3>
                            <p className="text-gray-600">Start your project in seconds with our intuitive platform. No technical expertise required.</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-blue-200 hover:border-violet-300 transition-all">
                            <h3 className="font-semibold text-gray-900 mb-2">Community First</h3>
                            <p className="text-gray-600">Build and engage with your community from day one. Turn supporters into active participants.</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-blue-200 hover:border-violet-300 transition-all">
                            <h3 className="font-semibold text-gray-900 mb-2">Full Control</h3>
                            <p className="text-gray-600">Maintain complete ownership of your project while using our powerful tools.</p>
                        </div>
                    </div>
                </div>

                {/* CTA Section */}
                <div className="text-center p-12">
                    <Link
                        to="/create"
                        className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg px-8 py-3 text-lg font-medium transition-colors duration-200 shadow-lg border border-sky-400"
                    >
                        Start Building
                    </Link>
                </div>
            </div>
        </div>
    );
} 