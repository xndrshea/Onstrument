import React from 'react';
import './TokenomicsRoadmap.css';

export function TokenomicsRoadmap() {
    return (
        <div className="roadmap-container">
            <div className="bg-gradient-to-r from-primary/20 to-transparent p-8 rounded-lg border border-primary/30 mb-12">
                <h2 className="text-3xl font-bold mb-6 text-primary">Tokenomics</h2>

                <p className="text-lg text-gray-200 mb-8 max-w-2xl leading-relaxed">
                    Fee Receival: We will be airdropping <span className="text-primary font-semibold">100% of fees</span> to subscribers biweekly.
                    No matter if the fees come from Onstrument bonding curves, overall market tokens,
                    future Telegram bots, or any other future products. <span className="text-primary font-semibold">100% of transaction fees</span> will
                    always be airdropped to subscribers.
                </p>
            </div>

            <div className="comparison-container grid grid-cols-3 gap-4 mb-8">
                {/* Header */}
                <div className="text-center p-4 bg-transparent">
                    {/* Empty header for feature column */}
                </div>
                <div className="text-center p-4 bg-gray-800 rounded-t-lg">
                    <h3 className="text-xl font-bold">Free Tier</h3>
                </div>
                <div className="text-center p-4 bg-primary rounded-t-lg">
                    <h3 className="text-xl font-bold">Subscription Tier</h3>
                </div>

                {/* Fee Receival Row */}
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    Fee Receival
                </div>
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    0%
                </div>
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    100%
                </div>

                {/* Transaction Fee Row */}
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    Onstrument Transaction Fee
                </div>
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    1%
                </div>
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    0%
                </div>

                {/* DEX Transaction Fee Row */}
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    Market Transaction Fee
                </div>
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    1%
                </div>
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    0%
                </div>

                {/* Migration Reward Row */}
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    Migration Reward
                </div>
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    0.5 SOL
                </div>
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    3 SOL
                </div>

                {/* Liquidity Migration Row */}
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    Liquidity % Migration
                </div>
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    100%
                </div>
                <div className="p-4 bg-gray-700 border-b border-gray-600">
                    100%
                </div>
            </div>

            <div className="airdrop-section mt-12 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-radial from-primary/20 via-transparent to-transparent opacity-50"></div>
                <div className="relative z-10 p-8 backdrop-blur-sm rounded-2xl border border-primary/20 shadow-lg shadow-primary/5">
                    <h2 className="text-3xl font-bold mb-8 text-primary inline-flex items-center">
                        <span className="mr-3">Airdrop</span>
                        <div className="h-px flex-grow bg-gradient-to-r from-primary/50 to-transparent w-32"></div>
                    </h2>
                    <ul className="space-y-6">
                        {[
                            "Points system is already live",
                            "We will be airdropping a minimum of 80+ % to Onstrument users",
                            "Maximum 20% for team"
                        ].map((item, index) => (
                            <li key={index} className="flex items-center group">
                                <div className="relative">
                                    <div className="h-3 w-3 rounded-full bg-primary group-hover:animate-ping absolute"></div>
                                    <div className="h-3 w-3 rounded-full bg-primary relative"></div>
                                </div>
                                <span className="ml-4 text-lg text-gray-300 group-hover:text-primary transition-colors">
                                    {item}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

export default TokenomicsRoadmap; 