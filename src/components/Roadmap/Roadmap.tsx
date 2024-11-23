import React from 'react';
import './Roadmap.css';

interface RoadmapStage {
    id: number;
    title: string;
}

export function Roadmap() {
    const stages: RoadmapStage[] = [
        {
            id: 1,
            title: "MEME FACTORY"
        },
        {
            id: 2,
            title: "TRADING SUITE"
        },
        {
            id: 3,
            title: "DECENTRALIZED HOSTING"
        }
    ];

    return (
        <div className="roadmap-container">
            <div className="roadmap-header">
                <h1>Evolution</h1>
            </div>

            <div className="stages-container">
                {stages.map((stage) => (
                    <div key={stage.id} className="roadmap-stage">
                        <h2>{stage.title}</h2>
                        <span className="stage-number">0{stage.id}</span>
                    </div>
                ))}
            </div>

            <div className="stages-container" style={{ marginTop: '2rem' }}>
                <div className="roadmap-stage">
                    <h2>Make Airdrops Great Again</h2>
                    <div className="tokenomics">
                        <div>10/20% Presale & Development</div>
                        <div>30% Team</div>
                        <div>50% Community</div>
                    </div>
                    <span className="stage-number">04</span>
                </div>
            </div>

            <div className="stages-container" style={{ marginTop: '2rem' }}>
                <div className="roadmap-stage highlight-stage">
                    <h2>100% OF FEES</h2>
                    <div className="tokenomics">
                        <div>Will Be Buying Back Our Native Token</div>
                    </div>
                    <span className="stage-number">05</span>
                </div>
            </div>
        </div>
    );
}

export default Roadmap; 