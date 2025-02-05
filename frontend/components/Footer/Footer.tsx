import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
// Remove the CSS import since we're using inline styles
// import './Footer.css';

export function Footer() {
    const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                setShowFeedbackPopup(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <footer className="bg-white border-t border-gray-200">
            <div className="max-w-7xl mx-auto px-4 py-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Company Info */}
                    <div className="col-span-1 relative">
                        <h3 className="text-base font-semibold text-gray-900 mb-2">Onstrument</h3>
                        <p className="text-gray-600 text-sm">
                            Building the future of tokenization.
                        </p>
                        <button
                            onClick={() => setShowFeedbackPopup(!showFeedbackPopup)}
                            className="mt-4 rounded-lg bg-violet-100 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-200 transition-colors"
                        >
                            Feedback!
                        </button>

                        {showFeedbackPopup && (
                            <div
                                ref={popupRef}
                                className="absolute bottom-full left-0 mb-2 bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-64 z-50"
                            >
                                <h3 className="text-sm font-semibold text-gray-900 mb-3">Connect with us:</h3>
                                <p className="text-sm text-gray-600 mb-3">Your suggestions are extremely important to us</p>
                                <div className="space-y-2">
                                    <a
                                        href="https://twitter.com/onstrument"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center p-2 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                                    >
                                        <div className="w-8 h-8 flex items-center justify-center bg-black rounded-full mr-3">
                                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                            </svg>
                                        </div>
                                        <span className="text-sm text-gray-700">X (Twitter)</span>
                                    </a>
                                    <a
                                        href="https://t.me/onstrument"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center p-2 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                                    >
                                        <div className="w-8 h-8 flex items-center justify-center bg-[#229ED9] rounded-full mr-3">
                                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.223-.535.223l.19-2.712 4.94-4.465c.215-.19-.047-.297-.332-.107l-6.107 3.843-2.332-.725c-.505-.16-.514-.508.11-.754l9.083-3.5c.424-.162.81.102.483 1.225z" />
                                            </svg>
                                        </div>
                                        <span className="text-sm text-gray-700">Telegram</span>
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Resources */}
                    <div className="col-span-1">
                        <h3 className="text-base font-semibold text-gray-900 mb-2">Resources</h3>
                        <ul className="space-y-1">
                            <li>
                                <Link to="/terms-of-service" className="text-gray-600 hover:text-blue-600 text-sm">
                                    Terms of Service
                                </Link>
                            </li>
                            <li>
                                <Link to="/privacy-policy" className="text-gray-600 hover:text-blue-600 text-sm">
                                    Privacy Policy
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Social Links */}
                    <div className="col-span-1">
                        <h3 className="text-base font-semibold text-gray-900 mb-2">Connect</h3>
                        <div className="flex space-x-4">
                            <a
                                href="https://twitter.com/onstrument"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-600 hover:text-blue-600"
                            >
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                </svg>
                            </a>
                            <a
                                href="https://t.me/Onstrument"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-600 hover:text-blue-600"
                            >
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M19.2 4.4L2.9 10.7c-1.1.4-1.1 1.1-.2 1.3l4.1 1.3 1.6 4.8c.2.5.4.7.8.7.5 0 .8-.2 1.1-.5l2.5-2.5 4.7 3.5c.9.5 1.5.2 1.7-.8l3.2-15c.3-1.3-.5-1.8-1.4-1.4zM17.1 7.4l-7.8 7.1-.3 3.3L7.4 13l9.2-5.8c.4-.3.8.1.5.2z" />
                                </svg>
                            </a>
                        </div>
                    </div>
                </div>

                {/* Copyright */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-center text-gray-600 text-sm">
                        © {new Date().getFullYear()} Onstrument. All rights reserved.
                    </p>
                </div>
            </div>
        </footer>
    );
} 