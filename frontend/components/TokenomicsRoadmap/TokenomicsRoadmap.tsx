import React from 'react';
import './TokenomicsRoadmap.css';

export function TokenomicsRoadmap() {
    return (
        <div className="roadmap-container">

            <div className="relative mx-auto max-w-4xl mb-16">
                <div className="absolute inset-0 bg-gradient-radial from-blue-500/20 via-violet-500/5 to-transparent blur-xl"></div>
                <div className="relative bg-black/40 backdrop-blur-md p-10 rounded-2xl border border-blue-500/30 hover:border-violet-500/50 transition-all duration-500 shadow-2xl shadow-blue-500/10">
                    <div className="flex flex-col items-center text-center mb-6">
                        <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-500 mb-2">
                            100% Fee Distribution
                        </h2>
                        <div className="h-1 w-24 bg-gradient-to-r from-transparent via-blue-500 to-transparent"></div>
                    </div>

                    <p className="text-xl text-gray-200 leading-relaxed mb-6">
                        Every two weeks, we airdrop <span className="text-blue-400 font-bold animate-pulse">100% of all fees</span> directly to subscribers.
                    </p>

                    <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                        {[
                            "Onstrument Bonding Curves",
                            "Solana Tokens",
                            "Telegram Bots",
                            "Onstrument News Terminal",
                            "All Future Products"
                        ].map((source) => (
                            <div key={source} className="bg-blue-500/5 rounded-lg p-4 border border-blue-500/20 hover:border-violet-500/40 hover:bg-violet-500/10 transition-all duration-300">
                                <span className="text-gray-200">{source}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 flex justify-center">
                        <div className="inline-flex items-center bg-blue-500/10 rounded-full px-6 py-3 border border-blue-500/30">
                            <span className="text-gray-200">Regardless of the chain or the product, ALL fees → Subscribers</span>
                        </div>
                    </div>
                </div>
            </div>

            <p className="text-lg text-gray-300 leading-relaxed mb-16 italic text-center max-w-3xl mx-auto">
                This is a first of its kind tokenomics experiment, moving from transaction fees to a subscription model. We will keep building all of your favorite features and products to maximize your subscription.
            </p>

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
                                "Maximum 20% for team"
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