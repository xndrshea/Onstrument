import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { TokenCreationForm } from '../TokenCreation/TokenCreationForm';
import { useState } from 'react';
import { Dialog } from '@headlessui/react';

export function LandingPage() {
    const { connected } = useWallet();
    const { setVisible } = useWalletModal();
    const [showQuickForm, setShowQuickForm] = useState(false);

    const handleQuickStart = () => {
        if (!connected) {
            setVisible(true);
        } else {
            setShowQuickForm(!showQuickForm);
        }
    };

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
                                className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-8 py-3 text-lg font-medium transition-colors duration-200"
                            >

                                Start Project
                            </button>
                            <span className="text-sm text-gray-500 italic mt-2">in seconds</span>
                        </div>

                        <div className="flex flex-col items-center">
                            <Link
                                to="/create"
                                className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-8 py-3 text-lg font-medium transition-colors duration-200"
                            >

                                Start Project
                            </Link>
                            <span className="text-sm text-gray-500 italic mt-2">in minutes</span>
                        </div>

                        <div className="flex flex-col items-center">
                            <Link
                                to="/contact"
                                className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-8 py-3 text-lg font-medium transition-colors duration-200"
                            >

                                Start Project
                            </Link>
                            <span className="text-sm text-gray-500 italic mt-2">in days to weeks</span>
                        </div>
                    </div>
                </div>

                {showQuickForm && (
                    <Dialog open={showQuickForm} onClose={() => setShowQuickForm(false)} className="relative z-50">
                        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                        <div className="fixed inset-0 flex items-center justify-center p-4">
                            <Dialog.Panel className="bg-white rounded-lg p-6 w-full max-w-xl">
                                <TokenCreationForm />
                            </Dialog.Panel>
                        </div>
                    </Dialog>
                )}

                {/* How It Works Section */}
                <div className="mb-20">
                    <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
                    <div className="space-y-8 max-w-4xl mx-auto">
                        <div className="bg-gradient-to-br from-blue-50 to-violet-50 p-8 rounded-2xl">
                            <p className="text-xl text-gray-700">
                                Whether you want to bootstrap your tech startup, publish a book, or create the next hot meme,
                                Onstrument is the place to do it.
                            </p>
                        </div>
                        <div className="bg-gradient-to-br from-blue-50 to-violet-50 p-8 rounded-2xl">
                            <p className="text-xl text-gray-700">
                                Onstrument adapts to its users. You can choose to build in public, post videos, and interact with your community.
                                You can also choose to build in private, stay anonymous, and only interact with your team.
                                All you need is a Solana wallet (for now).
                            </p>
                        </div>


                        <div className="bg-gradient-to-br from-blue-50 to-violet-50 p-8 rounded-2xl">
                            <p className="text-xl text-gray-700">
                                If you want custom tokenization solutions, reach out to us on Telegram or X. We can make anything happen,
                                as long as it's on-chain.
                            </p>
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
                            <p className="text-gray-600">Start your project in minutes with our intuitive platform. No technical expertise required.</p>
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

                {/* Why Choose Section */}
                <div className="mb-20">
                    <h2 className="text-3xl font-bold text-center mb-12">Why Choose Onstrument?</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-gradient-to-br from-blue-50 to-violet-50 p-8 rounded-2xl">
                            <h3 className="text-2xl font-bold text-gray-900 mb-4">Built for Creators</h3>
                            <p className="text-gray-600">
                                From artists and educators to developers and entrepreneurs, our platform provides all the tools you need to succeed. Launch, manage, and grow your project with confidence.
                            </p>
                        </div>
                        <div className="bg-gradient-to-br from-blue-50 to-violet-50 p-8 rounded-2xl">
                            <h3 className="text-2xl font-bold text-gray-900 mb-4">Community-Driven</h3>
                            <p className="text-gray-600">
                                Join a diverse ecosystem of creators and innovators. Share ideas, get feedback, and build relationships that help your project thrive.
                            </p>
                        </div>
                    </div>
                </div>

                {/* CTA Section */}
                <div className="text-center bg-gradient-to-r from-blue-50 to-violet-50 rounded-2xl p-12">
                    <Link
                        to="/create"
                        className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-8 py-3 text-lg font-medium transition-colors duration-200"
                    >
                        Start Building
                    </Link>
                </div>
            </div>
        </div>
    );
} 