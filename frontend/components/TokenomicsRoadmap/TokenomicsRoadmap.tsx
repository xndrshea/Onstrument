import React from 'react';
import './TokenomicsRoadmap.css';

export function TokenomicsRoadmap() {
    return (
        <div className="roadmap-container">
            {/* Roadmap Section */}
            <div className="roadmap-section mb-16">
                <div className="text-center mb-8">
                    <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600 mb-2">
                        Product Roadmap
                    </h2>
                    <div className="h-1 w-24 mx-auto bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-8">
                    {[
                        { text: "Onstrument Projects", status: "Completed" },
                        { text: "Solana Ecosystem Trading", status: "Completed" },
                        { text: "Integrated Telegram Bots" },
                        { text: "Onstrument News Terminal" },
                        { text: "Open Source" },
                        { text: "TBA" }
                    ].map((item, index) => (
                        <div key={typeof item === 'string' ? item : item.text} className="relative">
                            <div className="bg-white rounded-lg p-6 border border-blue-200 hover:border-violet-300 hover:bg-violet-50 transition-all duration-300 h-full shadow-sm">
                                <div className="text-blue-600 font-bold mb-2">Phase {index + 1}</div>
                                <span className="text-gray-700">{typeof item === 'string' ? item : item.text}</span>
                                {item.status && (
                                    <div className="mt-2 text-sm text-emerald-600">✓ {item.status}</div>
                                )}
                            </div>
                            {index < 5 && (
                                <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-blue-200"></div>
                            )}
                        </div>
                    ))}
                </div>
                <p className="text-center text-sm text-gray-600 italic mt-4">
                    We are not short on ideas, but going forward we will be implementing based on YOUR feedback. Our roadmap will adapt. Please reach out. Every detail matters.
                </p>
            </div>

            {/* Comparison Table */}
            <div className="comparison-container grid grid-cols-3 gap-4 mb-8">
                <div className="text-center p-4 bg-transparent">
                </div>
                <div className="text-center p-4 bg-white rounded-t-lg border border-blue-200">
                    <h3 className="text-xl font-bold text-gray-800">Free Tier</h3>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-t-lg border border-violet-200">
                    <h3 className="text-xl font-bold text-blue-600">Subscription Tier</h3>
                </div>

                {/* Table rows - using a lighter theme */}
                {[
                    ["Onstrument Transaction Fee", "1%", "0%"],
                    ["Market Transaction Fee", "1%", "0%"],
                    ["Migration Reward", "0.5 SOL", "3 SOL"],
                    ["Onstrument Team Migration Reward", "0%", "0%"]
                ].map(([label, free, sub], index) => (
                    <React.Fragment key={index}>
                        <div className="p-4 bg-white border-b border-blue-100 text-gray-700">{label}</div>
                        <div className="p-4 bg-white border-b border-blue-100 text-gray-700">{free}</div>
                        <div className="p-4 bg-white border-b border-blue-100 text-gray-700">{sub}</div>
                    </React.Fragment>
                ))}
            </div>

            {/* Airdrop Section */}
            <div className="airdrop-section mt-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-gradient-to-br from-blue-50 to-violet-50 p-8 rounded-2xl border border-blue-200">
                        <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600 mb-6">Airdrop</h2>
                        <p className="text-gray-700 text-lg mb-4">
                            Join our community and earn your share of the airdrop. The points system is live,
                            and we're committed to rewarding our early supporters.
                        </p>
                        <p className="text-gray-700 text-lg">
                            After the airdrop, a percentage of transactoin fees will go to buy backs. Indefinitely. YOU decide the overall tokenomics.
                            Nothing is set in stone.
                        </p>
                    </div>

                    <div className="bg-white p-8 rounded-2xl border border-blue-200 shadow-sm">
                        <div className="space-y-6">
                            {[
                                "Points system is already live",
                                <>We will be distributing points every month, and a subscription gets you <span className="text-amber-600 font-bold">gold</span> points</>,
                                "We will be airdropping a minimum of 80+ % to Onstrument users",
                                "Maximum 20% for team",
                            ].map((item, index) => (
                                <div
                                    key={index}
                                    className="flex items-start group hover:bg-blue-50 p-4 rounded-lg transition-all duration-300"
                                >
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center mr-4">
                                        <span className="text-blue-600 font-bold">{index + 1}</span>
                                    </div>
                                    <p className="text-gray-700 group-hover:text-blue-600 transition-colors">
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