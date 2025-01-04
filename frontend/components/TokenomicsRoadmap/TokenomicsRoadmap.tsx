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

            <div className="roadmap-section mt-12">
                <h2 className="text-2xl font-bold mb-6">Development Roadmap</h2>
                <ul className="list-disc pl-5 space-y-2 text-gray-400">
                    <li>Full Telegram bot integration</li>
                    <li>Price charts for onstrument tokens currently show execution prices, so charts may be slightly off</li>
                    <li>Points system for tracking your airdrop potential</li>
                    <li>Migration leaderboards, tokens about to graduate</li>
                    <li>Launch and trade tokens from Telegram</li>
                    <li>Price backfilling for all tokens</li>
                    <li>Full Ethereum expansion</li>
                    <li>UI/UX improvements</li>
                    <li>Lots of user feedback</li>
                    <li>Airdrop</li>
                    <li>Transaction history for all tokens</li>
                    <li>Live transactions for all of Onstrument</li>
                    <li>Advanced order types</li>
                    <li>Custom DEX aggregation</li>
                    <li>Running our own nodes across ecosystems for faster info</li>
                    <li>APIs for price history and everything else</li>
                    <li>Potentially open source (?)</li>
                    <li>No-fee perpetuals</li>
                    <li>Most importantly: whatever YOU want</li>
                    <li>Contact for feature and bug feedback</li>

                </ul>
            </div>

            <div className="airdrop-section mt-12">
                <h2 className="text-2xl font-bold mb-6">Airdrop</h2>
                <ul className="list-disc pl-5 space-y-2 text-gray-400">
                    <li>Points system is already live</li>
                    <li>We will be airdropping a minimum of 80+ % to Onstrument users</li>
                    <li>Maximum 20% for team</li>
                </ul>
            </div>
        </div>
    );
}

export default TokenomicsRoadmap; 