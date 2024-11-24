import React from 'react';
import './Roadmap.css';

interface RoadmapStage {
    id: number;
    title: string;
    subtitle?: string;
}

interface AirdropBreakdown {
    percentage: string;
    label: string;
}

export function Roadmap() {
    const stages: RoadmapStage[] = [
        {
            id: 1,
            title: "LAUNCH PHASE",
            subtitle: "Basic token creation, On-chain bonding curve implementation, Buy/sell functionality, Frontend interface"
        },
        {
            id: 2,
            title: "ENHANCEMENT PHASE",
            subtitle: "Advanced curve types, Price impact displays, Trade history tracking, Creator analytics"
        },
        {
            id: 3,
            title: "BUYBACK IMPLEMENTATION",
            subtitle: "100% fee collection system, Automated buyback mechanism, Fee distribution tracking, Permanent fee lock-in"
        },
        {
            id: 4,
            title: "FUTURE DEVELOPMENT",
            subtitle: "Mobile-optimized interface, Advanced trading features, Integration with other DEXs, Cross-chain support"
        }
    ];

    const airdropData: AirdropBreakdown[] = [
        {
            percentage: "60%",
            label: "Community Airdrop"
        },
        {
            percentage: "30%",
            label: "Team Allocation"
        },
        {
            percentage: "10%",
            label: "Presale"
        }
    ];

    return (
        <div className="roadmap-container">
            <div className="airdrop-breakdown">
                <h2>Token Distribution</h2>
                <div className="airdrop-items">
                    {airdropData.map((item, index) => (
                        <div key={index} className="airdrop-item">
                            <span className="percentage">{item.percentage}</span>
                            <span className="label">{item.label}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="roadmap-header">
                <h1>Roadmap</h1>
            </div>
            <div className="stages-container">
                {stages.map((stage) => (
                    <div key={stage.id} className="roadmap-stage">
                        <h2>{stage.title}</h2>
                        <p className="stage-subtitle">{stage.subtitle}</p>
                        <span className="stage-number">0{stage.id}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Roadmap; 