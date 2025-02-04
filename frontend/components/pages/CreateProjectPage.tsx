import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TokenCreationForm } from '../TokenCreation/TokenCreationForm';

type ProjectStep = 'category' | 'teams' | 'story' | 'basics';

export function CreateProjectPage() {
    const [currentStep, setCurrentStep] = useState<ProjectStep>('category');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [categoryError, setCategoryError] = useState('');
    const [teamMembers, setTeamMembers] = useState([{ name: '', role: '', social: '' }]);
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [projectTitle, setProjectTitle] = useState('');
    const [projectDescription, setProjectDescription] = useState('');
    const [projectStory, setProjectStory] = useState('');
    const [projectWebsite, setProjectWebsite] = useState('');
    const [teamError, setTeamError] = useState('');
    const [storyError, setStoryError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    const handleNextStep = () => {
        if (!selectedCategory) {
            setCategoryError('Please select a category before proceeding');
            return;
        }
        setCurrentStep('teams');
        setCategoryError('');
    };

    const handleTeamsNext = () => {
        if (!isAnonymous) {
            const hasValidTeamMember = teamMembers.some(member =>
                member.name.trim() !== '' && member.role.trim() !== ''
            );
            if (!hasValidTeamMember) {
                setTeamError('Please add at least one team member with name and role, or select anonymous');
                return;
            }
        }
        setTeamError('');
        setCurrentStep('story');
    };

    const handleStoryNext = () => {
        if (!projectTitle.trim()) {
            setStoryError('Please enter a project title');
            return;
        }
        if (!projectDescription.trim()) {
            setStoryError('Please enter a short description');
            return;
        }
        if (!projectStory.trim()) {
            setStoryError('Please enter your project story');
            return;
        }
        setStoryError('');
        setCurrentStep('basics');
    };

    const renderStep = () => {
        switch (currentStep) {
            case 'category':
                return (
                    <div className="max-w-2xl mx-auto py-12">
                        <h1 className="text-3xl font-bold text-center mb-4">
                            First, let's get you set up.
                        </h1>
                        <h2 className="text-xl text-center mb-8">
                            Select a category for your new project.
                        </h2>
                        <p className="text-gray-600 text-center mb-12">
                            This will help backers find your project, and you can change it later if you need to.
                        </p>

                        <div className="space-y-4">
                            <select
                                className={`w-full p-3 border ${categoryError ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                                onChange={(e) => {
                                    setSelectedCategory(e.target.value);
                                    setCategoryError('');
                                }}
                                value={selectedCategory}
                                required
                            >
                                <option value="">Select a category</option>
                                <option value="ai">AI</option>
                                <option value="meme">Meme</option>
                                <option value="defi">DeFi</option>
                                <option value="gaming">Gaming</option>
                                <option value="rwa">RWA (Real World Assets)</option>
                                <option value="other">Other</option>
                            </select>
                            {categoryError && (
                                <p className="text-red-500 text-sm mt-1">{categoryError}</p>
                            )}
                        </div>

                        <div className="mt-8 flex justify-between items-center">
                            <p className="text-gray-600">Your first project! Welcome.</p>
                            <button
                                onClick={handleNextStep}
                                className="bg-sky-500 hover:bg-sky-600 text-white px-6 py-2 rounded-lg shadow-lg border border-sky-400"
                            >
                                Next: Project Basics
                            </button>
                        </div>

                        <p className="text-gray-500 text-sm mt-12">
                            Please note: Your ability to edit, hide, or delete a project is limited after you launch a project.
                        </p>
                    </div>
                );
            case 'teams':
                return (
                    <div className="max-w-2xl mx-auto py-12">
                        <h1 className="text-3xl font-bold text-center mb-4">
                            Build Your Team
                        </h1>
                        <p className="text-gray-600 text-center mb-8">
                            Add team members to your project or stay anonymous
                        </p>

                        <div className="mb-8">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isAnonymous}
                                    onChange={(e) => setIsAnonymous(e.target.checked)}
                                    className="form-checkbox h-5 w-5 text-purple-600 rounded"
                                />
                                <span className="text-gray-700">Stay anonymous</span>
                            </label>
                        </div>

                        {!isAnonymous && (
                            <div className="mb-8">
                                <h2 className="text-xl font-semibold mb-4">Team Members</h2>
                                {teamMembers.map((member, index) => (
                                    <div key={index} className="mb-4 p-4 border rounded-lg">
                                        <input
                                            type="text"
                                            placeholder="Name"
                                            value={member.name}
                                            onChange={(e) => {
                                                const newTeamMembers = [...teamMembers];
                                                newTeamMembers[index].name = e.target.value;
                                                setTeamMembers(newTeamMembers);
                                            }}
                                            className="w-full p-2 mb-2 border rounded"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Role"
                                            value={member.role}
                                            onChange={(e) => {
                                                const newTeamMembers = [...teamMembers];
                                                newTeamMembers[index].role = e.target.value;
                                                setTeamMembers(newTeamMembers);
                                            }}
                                            className="w-full p-2 mb-2 border rounded"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Social Media URL"
                                            value={member.social}
                                            onChange={(e) => {
                                                const newTeamMembers = [...teamMembers];
                                                newTeamMembers[index].social = e.target.value;
                                                setTeamMembers(newTeamMembers);
                                            }}
                                            className="w-full p-2 border rounded"
                                        />
                                    </div>
                                ))}
                                <button
                                    onClick={() => setTeamMembers([...teamMembers, { name: '', role: '', social: '' }])}
                                    className="bg-sky-500 hover:bg-sky-600 text-white px-6 py-2 rounded-lg shadow-lg border border-sky-400"
                                >
                                    + Add Team Member
                                </button>
                            </div>
                        )}

                        {teamError && (
                            <p className="text-red-500 text-sm mt-4 mb-4">{teamError}</p>
                        )}

                        <div className="flex justify-between items-center">
                            <button
                                onClick={() => setCurrentStep('category')}
                                className="text-gray-600 hover:text-gray-800"
                            >
                                ← Back
                            </button>
                            <button
                                onClick={handleTeamsNext}
                                className="bg-sky-500 hover:bg-sky-600 text-white px-6 py-2 rounded-lg shadow-lg border border-sky-400"
                            >
                                Next: Project Story
                            </button>
                        </div>
                    </div>
                );
            case 'story':
                return (
                    <div className="max-w-2xl mx-auto py-12">
                        <h1 className="text-3xl font-bold text-center mb-4">
                            Tell Your Story
                        </h1>
                        <p className="text-gray-600 text-center mb-8">
                            Share the vision and goals of your project
                        </p>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Project Title *
                                </label>
                                <input
                                    type="text"
                                    value={projectTitle}
                                    onChange={(e) => setProjectTitle(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    placeholder="Enter your project title"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Short Description *
                                </label>
                                <input
                                    type="text"
                                    value={projectDescription}
                                    onChange={(e) => setProjectDescription(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    placeholder="Brief overview of your project (140 characters)"
                                    maxLength={140}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Project Story *
                                </label>
                                <textarea
                                    value={projectStory}
                                    onChange={(e) => setProjectStory(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[200px]"
                                    placeholder="Tell us about your project, its goals, and why people should be excited about it..."
                                    required
                                />
                            </div>

                        </div>

                        {storyError && (
                            <p className="text-red-500 text-sm mt-4">{storyError}</p>
                        )}

                        <div className="flex justify-between items-center mt-8">
                            <button
                                onClick={() => setCurrentStep('teams')}
                                className="text-gray-600 hover:text-gray-800"
                            >
                                ← Back
                            </button>
                            <button
                                onClick={handleStoryNext}
                                className="bg-sky-500 hover:bg-sky-600 text-white px-6 py-2 rounded-lg shadow-lg border border-sky-400"
                            >
                                Next: Project Basics
                            </button>
                        </div>
                    </div>
                );
            case 'basics':
                return (
                    <div className="max-w-2xl mx-auto py-12">
                        <TokenCreationForm
                            onSuccess={() => navigate('/projects')}
                            onTokenCreated={() => navigate('/projects')}
                            projectData={{
                                category: selectedCategory,
                                teamMembers: isAnonymous ? [] : teamMembers,
                                isAnonymous,
                                projectTitle,
                                projectDescription,
                                projectStory
                            }}
                        />
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-white">
            <div className="bg-gray-100 border-b border-gray-200">
                <div className="max-w-5xl mx-auto px-4 py-4">
                    <div className="flex justify-between items-center">
                        <div className="flex space-x-8">
                            {['Category', 'Teams', 'Story', 'Basics'].map((step, index) => (
                                <div
                                    key={step}
                                    className={`flex items-center space-x-2 ${currentStep === step.toLowerCase()
                                        ? 'text-sky-500 font-medium'
                                        : 'text-gray-500'
                                        }`}
                                >
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${currentStep === step.toLowerCase()
                                        ? 'bg-sky-500 text-white'
                                        : 'bg-gray-200'
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

            <div className="max-w-5xl mx-auto px-4">
                {renderStep()}
            </div>
        </div>
    );
} 