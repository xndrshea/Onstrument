import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

export function Footer() {
    return (
        <footer className="footer">
            <div className="footer-content">
                <div className="footer-links">
                    <Link to="/roadmap">Roadmap</Link>
                </div>
                <div className="footer-copyright">
                    © {new Date().getFullYear()} Solana Token Launchpad
                </div>
            </div>
        </footer>
    );
} 