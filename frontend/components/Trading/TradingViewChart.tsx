import { TokenRecord } from "../../../shared/types/token";
import { useEffect, useRef } from 'react';

interface PriceChartProps {
    token: TokenRecord;
    width?: number;
    height?: number;
}

export function TradingViewChart({ token, width = 600, height = 300 }: PriceChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // TradingView chart will be initialized here
        // It will use the /ohlcv endpoint which returns data from our generated columns
    }, [token]);

    return (
        <div ref={containerRef} style={{ width, height }}>
            <p>TradingView chart coming soon - will use OHLCV data!</p>
        </div>
    );
} 