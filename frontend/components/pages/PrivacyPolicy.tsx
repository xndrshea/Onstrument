import React from 'react';

export function PrivacyPolicy() {
    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-white mb-8">Privacy Policy</h1>
            <div className="bg-[#232427] rounded-lg p-6 space-y-6 text-gray-300">
                <div className="text-sm text-gray-400">Last Updated: January 23, 2025</div>

                <section>
                    <h2 className="text-2xl font-semibold text-white mb-4">1. Introduction</h2>
                    <p>This Privacy Policy governs Onstrument's data practices. By using our platform, you agree to these terms. Our services are not directed to anyone under 18.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold text-white mb-4">2. Data Controller</h2>
                    <p>Onstrument ("we," "our," or "us") is the data controller for personal information collected through our trading platform.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold text-white mb-4">3. Information Collection</h2>
                    <p>We collect:</p>
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                        <li>Wallet addresses and transaction data</li>
                        <li>Platform usage information</li>
                        <li>Device and connection data</li>
                        <li>Subscription and payment information</li>
                        <li>Technical trading preferences</li>
                        <li>Information from third parties and public sources</li>
                    </ul>
                    <p className="mt-2">Some data collection is mandatory for platform functionality; optional data will be clearly marked.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold text-white mb-4">4. Legal Basis for Processing</h2>
                    <p>We process data based on:</p>
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                        <li>Contract performance</li>
                        <li>Legal obligations</li>
                        <li>Legitimate interests</li>
                        <li>Your consent (with opt-out rights where applicable)</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold text-white mb-4">5. Data Usage</h2>
                    <p>We use collected information to:</p>
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                        <li>Provide trading services</li>
                        <li>Process transactions</li>
                        <li>Maintain platform security</li>
                        <li>Comply with regulations</li>
                        <li>Improve our services</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold text-white mb-4">6. Data Sharing</h2>
                    <p>We share data with:</p>
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                        <li>Service providers</li>
                        <li>Legal authorities when required</li>
                        <li>Blockchain networks (public ledger)</li>
                        <li>Potential business acquirers in case of merger/acquisition</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold text-white mb-4">7. Data Retention</h2>
                    <p>We retain data as long as:</p>
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                        <li>Required by law</li>
                        <li>Necessary for services</li>
                        <li>Needed for legitimate business purposes</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold text-white mb-4">8. Your Rights</h2>
                    <h3 className="text-xl font-semibold text-white mb-2">General Rights</h3>
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                        <li>Access your data</li>
                        <li>Request corrections</li>
                        <li>Withdraw consent</li>
                        <li>File complaints</li>
                    </ul>

                    <h3 className="text-xl font-semibold text-white mt-4 mb-2">EU/UK Specific Rights</h3>
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                        <li>Right to erasure ("right to be forgotten")</li>
                        <li>Right to data portability</li>
                        <li>Right to restrict processing</li>
                        <li>Right to object to processing</li>
                        <li>Right to lodge complaints with supervisory authorities</li>
                    </ul>
                    <p className="mt-2">Note: Blockchain data cannot be erased due to technical limitations.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold text-white mb-4">9. International Transfers</h2>
                    <p>We transfer data internationally with appropriate safeguards under GDPR and applicable laws.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold text-white mb-4">10. Security</h2>
                    <p>We implement appropriate technical and organizational security measures to protect your data.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold text-white mb-4">11. Changes</h2>
                    <p>We will notify you of material changes to this policy.</p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold text-white mb-4">12. Contact</h2>
                    <p>alexander@onstrument.com</p>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold text-white mb-4">13. Blockchain Notice</h2>
                    <p>Transaction data on public blockchains:</p>
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                        <li>Is immutable and cannot be deleted</li>
                        <li>May be subject to forensic analysis</li>
                        <li>Can potentially lead to re-identification</li>
                        <li>Cannot be modified by us</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-2xl font-semibold text-white mb-4">14. Cookies and Tracking Technologies</h2>
                    <p>We use various tracking technologies to enhance your experience:</p>
                    <ul className="list-disc pl-6 mt-2 space-y-1">
                        <li>Essential cookies for platform functionality</li>
                        <li>Analytics cookies to understand usage patterns</li>
                        <li>Performance cookies to optimize services</li>
                        <li>Third-party cookies for enhanced features</li>
                    </ul>
                    <p className="mt-2">You can manage cookie preferences through your browser settings. Note that disabling essential cookies may affect platform functionality.</p>
                </section>
            </div>
        </div>
    );
} 