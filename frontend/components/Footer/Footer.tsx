import React from 'react';
import { Link } from 'react-router-dom';
// Remove the CSS import since we're using inline styles
// import './Footer.css';

export function Footer() {
    return (
        <footer style={{
            backgroundColor: '#232427',
            height: '40px !important',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            position: 'relative',
            zIndex: 999,
            marginTop: '0 !important',
            padding: '0 !important'
        }}>
            <div style={{
                width: '100%',
                padding: '0 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                margin: '0 !important'
            }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Link to="/privacy-policy">Privacy Policy</Link>
                    <Link to="/terms-of-service">Terms of Service</Link>
                </div>
                <div>
                    © {new Date().getFullYear()} Onstrument - Onchain Instrument
                </div>
            </div>
        </footer>
    );
} 