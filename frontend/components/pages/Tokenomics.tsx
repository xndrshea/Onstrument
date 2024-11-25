import React from 'react';

export default function Tokenomics() {
    return (
        <div className="container mx-auto px-4 py-8">
            <div className="tokenomics-content">
                <section className="mb-8">
                    <h2 className="text-2xl font-bold mb-4">Token Distribution</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="bg-white/5 p-6 rounded-lg">
                            <h3 className="text-xl font-semibold mb-3">Initial Supply</h3>
                            <p className="text-gray-300">
                                The initial token supply is determined by the creator during token launch.
                                Each token follows its own unique bonding curve, which determines the price
                                dynamics based on supply and demand.
                            </p>
                        </div>
                        <div className="bg-white/5 p-6 rounded-lg">
                            <h3 className="text-xl font-semibold mb-3">Bonding Curve Mechanics</h3>
                            <p className="text-gray-300">
                                Tokens are minted and burned automatically through the bonding curve smart contract.
                                This creates a deterministic pricing mechanism that ensures liquidity at all times.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-bold mb-4">Curve Types</h2>
                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="bg-white/5 p-6 rounded-lg">
                            <h3 className="text-xl font-semibold mb-3">Linear</h3>
                            <p className="text-gray-300">
                                Price increases linearly with supply. Each new token minted increases the price
                                by a fixed amount determined by the slope parameter.
                            </p>
                        </div>
                        <div className="bg-white/5 p-6 rounded-lg">
                            <h3 className="text-xl font-semibold mb-3">Exponential</h3>
                            <p className="text-gray-300">
                                Price grows exponentially with supply. Suitable for tokens that should become
                                significantly more expensive as supply increases.
                            </p>
                        </div>
                        <div className="bg-white/5 p-6 rounded-lg">
                            <h3 className="text-xl font-semibold mb-3">Logarithmic</h3>
                            <p className="text-gray-300">
                                Price growth slows down as supply increases. Ideal for tokens that should
                                maintain more stable prices at higher supply levels.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="mb-8">
                    <h2 className="text-2xl font-bold mb-4">Price Discovery</h2>
                    <div className="bg-white/5 p-6 rounded-lg">
                        <p className="text-gray-300 mb-4">
                            Token prices are determined automatically by the bonding curve smart contract.
                            The price for buying or selling tokens is calculated based on:
                        </p>
                        <ul className="list-disc list-inside text-gray-300 space-y-2">
                            <li>Current token supply</li>
                            <li>Curve parameters (base price, slope, exponent, or log base)</li>
                            <li>Transaction size (larger trades have higher price impact)</li>
                        </ul>
                    </div>
                </section>
            </div>
        </div>
    );
} 