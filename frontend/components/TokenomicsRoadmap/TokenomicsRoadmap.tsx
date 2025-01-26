import React from 'react';
import './TokenomicsRoadmap.css';

export function TokenomicsRoadmap() {
    return (
        <div className="roadmap-container">

            <div className="relative mx-auto max-w-4xl mb-16">
                <div className="absolute inset-0 bg-gradient-radial from-blue-500/20 via-violet-500/5 to-transparent blur-xl"></div>
                <div className="relative bg-black/40 backdrop-blur-md p-10 rounded-2xl border border-blue-500/30 hover:border-violet-500/50 transition-all duration-500 shadow-2xl shadow-blue-500/10">
                    <div className="flex flex-col items-center justify-center text-center mb-6">
                        <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-500 mb-2">
                            100% Fee Distribution
                        </h2>
                        <div className="h-1 w-24 bg-gradient-to-r from-transparent via-blue-500 to-transparent"></div>
                    </div>

                    <p className="text-xl text-gray-200 leading-relaxed mb-6 text-center">
                        Onstrument airdrops <span className="text-blue-400 font-bold animate-pulse">100% of all transaction fees</span> biweekly from free users directly to subscribers.
                    </p>
                </div>
            </div>

            <p className="text-lg text-gray-300 leading-relaxed mb-16 italic text-center max-w-3xl mx-auto">
                This is a first of its kind tokenomics experiment, moving from transaction fees to a subscription model. We will keep building all of your favorite features and products to maximize your subscription.
            </p>

            {/* New Roadmap Section */}
            <div className="roadmap-section mb-16">
                <div className="text-center mb-8">
                    <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-500 mb-2">
                        Product Roadmap
                    </h2>
                    <div className="h-1 w-24 mx-auto bg-gradient-to-r from-transparent via-blue-500 to-transparent"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-8">
                    {[
                        { text: "Onstrument Bonding Curves", status: "Completed" },
                        { text: "Solana Tokens", status: "Completed" },
                        { text: "Fully Integrated Telegram Bots" },
                        { text: "Onstrument News Terminal" },
                        { text: "Open Source" },
                        { text: "All Future Products" }
                    ].map((item, index) => (
                        <div key={typeof item === 'string' ? item : item.text} className="relative">
                            <div className="bg-blue-500/5 rounded-lg p-6 border border-blue-500/20 hover:border-violet-500/40 hover:bg-violet-500/10 transition-all duration-300 h-full">
                                <div className="text-blue-400 font-bold mb-2">Phase {index + 1}</div>
                                <span className="text-gray-200">{typeof item === 'string' ? item : item.text}</span>
                                {item.status && (
                                    <div className="mt-2 text-sm text-emerald-400">✓ {item.status}</div>
                                )}
                            </div>
                            {index < 5 && (
                                <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-blue-500/30"></div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="comparison-container grid grid-cols-3 gap-4 mb-8">
                {/* Header */}
                <div className="text-center p-4 bg-transparent">
                    {/* Empty header for feature column */}
                </div>
                <div className="text-center p-4 bg-gray-800/60 backdrop-blur-sm rounded-t-lg border border-blue-500/20">
                    <h3 className="text-xl font-bold">Free Tier</h3>
                </div>
                <div className="text-center p-4 bg-blue-500/10 backdrop-blur-sm rounded-t-lg border border-violet-500/30">
                    <h3 className="text-xl font-bold text-blue-400">Subscription Tier</h3>
                </div>

                {/* Fee Receival Row */}
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    Fee Receival
                </div>
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    0%
                </div>
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    100%
                </div>

                {/* Transaction Fee Row */}
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    Onstrument Transaction Fee
                </div>
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    1%
                </div>
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    0%
                </div>

                {/* DEX Transaction Fee Row */}
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    Market Transaction Fee
                </div>
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    1%
                </div>
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    0%
                </div>

                {/* Migration Reward Row */}
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    Migration Reward
                </div>
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    0.5 SOL
                </div>
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    3 SOL
                </div>

                {/* Onstrument Team Migration Reward Row */}
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    Onstrument Team Migration Reward
                </div>
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    0%
                </div>
                <div className="p-4 bg-gray-800/40 backdrop-blur-sm border-b border-blue-500/20">
                    0%
                </div>
            </div>

            <div className="airdrop-section mt-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left side - Title and intro */}
                    <div className="bg-gradient-to-br from-blue-500/10 to-violet-500/5 p-8 rounded-2xl border border-blue-500/20">
                        <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-500 mb-6">Airdrop</h2>
                        <p className="text-gray-300 text-lg mb-4">
                            Join our community and earn your share of the airdrop. The points system is live,
                            and we're committed to rewarding our early supporters.
                        </p>
                    </div>

                    {/* Right side - Points list */}
                    <div className="bg-black/40 backdrop-blur-sm p-8 rounded-2xl border border-blue-500/20">
                        <div className="space-y-6">
                            {[
                                "Points system is already live",
                                <>We will be distributing points every month, and a subscription gets you <span className="text-amber-400 font-bold">gold</span> points</>,
                                "We will be airdropping a minimum of 80+ % to Onstrument users",
                                "Maximum 20% for team",
                                "A portion of the transaction fees will then start going to buy backs, but all airdrop details including qualification will be discussed with the community."
                            ].map((item, index) => (
                                <div
                                    key={index}
                                    className="flex items-start group hover:bg-blue-500/5 p-4 rounded-lg transition-all duration-300"
                                >
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mr-4">
                                        <span className="text-blue-400 font-bold">{index + 1}</span>
                                    </div>
                                    <p className="text-gray-200 group-hover:text-blue-400 transition-colors">
                                        {item}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TokenomicsRoadmap; 