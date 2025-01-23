import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

export function Footer() {
    return (
        <footer className="footer">
            <div className="footer-content">
                <div className="footer-links">
                    <Link to="/privacy-policy">Privacy Policy</Link>
                    <Link to="/terms-of-service">Terms of Service</Link>
                </div>
                <div className="footer-copyright">
                    © {new Date().getFullYear()} Onstrument - Onchain Instrument
                </div>
            </div>
        </footer>
    );
} 