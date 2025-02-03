import { Link } from 'react-router-dom';

export function ContactPage() {
    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-7xl mx-auto px-4 py-16">
                <div className="text-center mb-16">
                    <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-violet-500 mb-6">
                        Contact Us
                    </h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
                        Looking for custom tokenomics?
                    </p>
                </div>

                <div className="max-w-3xl mx-auto">
                    <div className="bg-white p-8 rounded-2xl shadow-sm border mb-8">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Get in Touch</h2>
                        <p className="text-gray-600 mb-6">
                            Reach out to us for tokenization solutions:
                        </p>
                        <div className="space-y-4">

                            <a
                                href="https://t.me/onstrument"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center p-4 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                            >
                                <div className="w-10 h-10 flex items-center justify-center bg-[#229ED9] rounded-full mr-4">
                                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.223-.535.223l.19-2.712 4.94-4.465c.215-.19-.047-.297-.332-.107l-6.107 3.843-2.332-.725c-.505-.16-.514-.508.11-.754l9.083-3.5c.424-.162.81.102.483 1.225z" />
                                    </svg>
                                </div>
                                <span className="text-lg text-gray-700">Telegram: @onstrument</span>
                            </a>
                            <a
                                href="https://x.com/onstrument"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center p-4 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                            >
                                <div className="w-10 h-10 flex items-center justify-center bg-black rounded-full mr-4">
                                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                    </svg>
                                </div>
                                <span className="text-lg text-gray-700">X: @onstrument</span>
                            </a>
                            <a
                                href="mailto:alexander@onstrument.com"
                                className="flex items-center p-4 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                            >
                                <div className="w-10 h-10 flex items-center justify-center bg-violet-500 rounded-full mr-4">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <span className="text-lg text-gray-700">Email: alexander@onstrument.com</span>
                            </a>
                        </div>
                    </div>

                    <div className="text-center mt-12">
                        <Link
                            to="/"
                            className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-8 py-3 text-lg font-medium transition-colors duration-200"
                        >
                            Back to Home
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
} 