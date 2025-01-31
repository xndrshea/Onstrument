import React from 'react';
import { Link } from 'react-router-dom';
// Remove the CSS import since we're using inline styles
// import './Footer.css';

export function Footer() {
    return (
        <footer className="bg-white border-t border-gray-200">
            <div className="max-w-7xl mx-auto px-4 py-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Company Info */}
                    <div className="col-span-1">
                        <h3 className="text-base font-semibold text-gray-900 mb-2">Onstrument</h3>
                        <p className="text-gray-600 text-sm">
                            Building the future of token creation and management on Solana.
                        </p>
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
                                    <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
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