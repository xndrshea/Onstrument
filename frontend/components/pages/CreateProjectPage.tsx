import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TokenCreationForm } from '../TokenCreation/TokenCreationForm';

type ProjectStep = 'category' | 'basics' | 'tokenomics' | 'story' | 'review';

export function CreateProjectPage() {
    const [currentStep, setCurrentStep] = useState<ProjectStep>('category');
    const navigate = useNavigate();

    const renderStep = () => {
        switch (currentStep) {
            case 'category':
                return (
                    <div className="max-w-2xl mx-auto py-12">
                        <h1 className="text-3xl font-bold text-center mb-4">
                            First, let's get you set up.
                        </h1>
                        <h2 className="text-xl text-center mb-8">
                            Select a primary category and subcategory for your new project.
                        </h2>
                        <p className="text-gray-600 text-center mb-12">
                            These will help backers find your project, and you can change them later if you need to.
                        </p>

                        <div className="space-y-4">
                            <select
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                onChange={(e) => console.log(e.target.value)}
                            >
                                <option value="">Select a category</option>
                                <option value="art">Art</option>
                                <option value="games">Games</option>
                                <option value="music">Music</option>
                                <option value="technology">Technology</option>
                            </select>

                            <select
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                onChange={(e) => console.log(e.target.value)}
                            >
                                <option value="">--No subcategory--</option>
                            </select>
                        </div>

                        <div className="mt-8 flex justify-between items-center">
                            <p className="text-gray-600">Your first project! Welcome.</p>
                            <button
                                onClick={() => setCurrentStep('basics')}
                                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg"
                            >
                                Next: Project Basics
                            </button>
                        </div>

                        <p className="text-gray-500 text-sm mt-12">
                            Please note: Your ability to edit, hide, or delete a project is limited after you launch a project.
                        </p>
                    </div>
                );
            case 'basics':
                return (
                    <div className="max-w-2xl mx-auto py-12">
                        <TokenCreationForm
                            onSuccess={() => setCurrentStep('tokenomics')}
                            onTokenCreated={() => setCurrentStep('tokenomics')}
                        />
                    </div>
                );
            // Add other cases for different steps
        }
    };

    return (
        <div className="min-h-screen bg-white">
            {/* Progress bar */}
            <div className="bg-gray-100 border-b border-gray-200">
                <div className="max-w-5xl mx-auto px-4 py-4">
                    <div className="flex justify-between items-center">
                        <div className="flex space-x-8">
                            {['Category', 'Basics', 'Tokenomics', 'Story', 'Review'].map((step, index) => (
                                <div
                                    key={step}
                                    className={`flex items-center space-x-2 ${index === 0 ? 'text-purple-600 font-medium' : 'text-gray-500'
                                        }`}
                                >
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${index === 0 ? 'bg-purple-600 text-white' : 'bg-gray-200'
                                        }`}>
                                        {index + 1}
                                    </div>
                                    <span>{step}</span>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => navigate('/projects')}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            Exit
                        </button>
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="max-w-5xl mx-auto px-4">
                {renderStep()}
            </div>
        </div>
    );
} 