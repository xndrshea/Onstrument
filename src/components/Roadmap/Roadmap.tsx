import React, { useState } from 'react';
import './Roadmap.css';

interface RoadmapStage {
    id: number;
    title: string;
    description: string;
    features: {
        text: string;
        status: 'completed' | 'in-progress' | 'planned';
        highlight?: boolean;
    }[];
}

export function Roadmap() {
    const [expandedStage, setExpandedStage] = useState<number | null>(null);

    const stages: RoadmapStage[] = [
        {
            id: 1,
            title: "Stage 1: Meme Factory",
            description: "Revolutionizing meme token creation and distribution with automated tools and community features",
            features: [
                { text: "✅ Token Creation Interface", status: "completed" },
                { text: "✅ Bonding Curve Implementation", status: "completed" },
                { text: "✅ Basic Trading Features", status: "completed" },
                { text: "🔄 Meme Generator Integration", status: "in-progress", highlight: true },
                { text: "🔄 Community Voting System", status: "in-progress" },
                { text: "🔄 Automated Social Media Distribution", status: "in-progress", highlight: true },
                { text: "📅 Meme Token Templates", status: "planned" },
                { text: "📅 Token Launch Calendar", status: "planned" }
            ]
        },
        {
            id: 2,
            title: "Stage 2: Trading Suite",
            description: "Advanced trading features and automation tools for serious traders",
            features: [
                { text: "🔄 Limit Orders Implementation", status: "in-progress", highlight: true },
                { text: "🔄 Stop Loss & Take Profit", status: "in-progress" },
                { text: "🔄 Telegram Trading Bot", status: "in-progress", highlight: true },
                { text: "📅 Trading View Integration", status: "planned" },
                { text: "📅 Portfolio Analytics", status: "planned" },
                { text: "📅 Multi-DEX Aggregation", status: "planned", highlight: true },
            ]
        },
        {
            id: 3,
            title: "Stage 3: Web3 Infrastructure",
            description: "Decentralized web hosting and domain management solutions",
            features: [
                { text: "📅 Domain Name Marketplace", status: "planned", highlight: true },
                { text: "📅 Decentralized Hosting Platform", status: "planned", highlight: true },
                { text: "📅 IPFS Integration", status: "planned" },
                { text: "📅 Custom DNS Management", status: "planned" },
                { text: "📅 Token-Gated Hosting", status: "planned", highlight: true },
                { text: "📅 Web3 Site Builder", status: "planned" },
                { text: "📅 Domain Name Staking", status: "planned" },
                { text: "📅 Automated SSL Management", status: "planned" }
            ]
        },
        {
            id: 4,
            title: "Tokenomics",
            description: "Revolutionary token distribution model with 100% platform fee buyback mechanism",
            features: [
                { text: "💎 50% Historic Community Airdrop", status: "planned", highlight: true },
                { text: "💼 30% Team & Development", status: "planned" },
                { text: "🚀 20% Presale & Initial Dev", status: "planned" },
                { text: "♻️ 100% Platform Fee Buyback", status: "planned", highlight: true },
                { text: "💧 Automated Liquidity Provision", status: "planned", highlight: true }
            ]
        }
    ];

    const handleStageClick = (stageId: number) => {
        setExpandedStage(expandedStage === stageId ? null : stageId);
    };

    return (
        <div className="roadmap-container">
            <div className="roadmap-header">
                <h1>Evolution</h1>
                <p>Building the future of decentralized meme creation</p>
            </div>

            <div className="stages-container">
                {stages.map((stage) => (
                    <div
                        key={stage.id}
                        className={`roadmap-stage ${expandedStage === stage.id ? 'expanded' : ''}`}
                        onClick={() => handleStageClick(stage.id)}
                    >
                        <div className="stage-header">
                            <h2>{stage.title.split(":")[1]}</h2>
                            <span className="stage-number">0{stage.id}</span>
                        </div>

                        <p className="stage-description">{stage.description}</p>

                        <div className="features-list">
                            {stage.features.map((feature, index) => (
                                <div
                                    key={index}
                                    className={`feature-item ${feature.status}`}
                                >
                                    <span className="feature-text">{feature.text}</span>
                                    {feature.highlight && (
                                        <span className="priority-indicator" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="roadmap-footer">
                <div className="status-legend">
                    <span className="legend-item completed">Completed</span>
                    <span className="legend-item in-progress">In Progress</span>
                    <span className="legend-item planned">Planned</span>
                </div>
            </div>
        </div>
    );
}

export default Roadmap; 