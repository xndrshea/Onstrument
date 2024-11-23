import React from 'react';
import './Footer.css';

export function Footer() {
    return (
        <footer className="footer">
            <div className="footer-content">
                <div className="footer-copyright">
                    © {new Date().getFullYear()} Solana Token Launchpad
                </div>
            </div>
        </footer>
    );
} 