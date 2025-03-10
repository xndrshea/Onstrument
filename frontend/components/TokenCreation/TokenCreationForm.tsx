import React, { useState, useEffect } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { createTokenParams } from '../../../shared/types/token'
import { BN } from 'bn.js'
import { TokenTransactionService } from '../../services/TokenTransactionService'
import { TokenFormData } from '../../../shared/types/token'
import { PublicKey } from '@solana/web3.js'
import { TOKEN_DECIMALS } from '../../services/bondingCurve'
import { UserService } from '../../services/userService'
import { pinataService } from '../../services/pinataService'
import { useNavigate } from 'react-router-dom'

interface TokenCreationFormProps {
    onSuccess?: () => void
    onTokenCreated?: () => void
    projectData?: {
        category: string
        teamMembers: Array<{ name: string; role: string; social: string; }>
        isAnonymous: boolean
        projectTitle: string
        projectDescription: string
        projectStory: string
    }
}

const MAX_SUPPLY = 1_000_000_000_000; // 1 trillion
const MIN_SUPPLY = 10;

export function TokenCreationForm({ onSuccess, onTokenCreated, projectData }: TokenCreationFormProps) {
    const { connection } = useConnection()
    const wallet = useWallet()
    const navigate = useNavigate()
    const tokenTransactionService = new TokenTransactionService(wallet, connection, { tokenType: 'custom' })
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [supplyError, setSupplyError] = useState<string | null>(null)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [uploadingImage, setUploadingImage] = useState(false)
    const [isSubscribed, setIsSubscribed] = useState(false)
    const [showMore, setShowMore] = useState(false)

    useEffect(() => {
        async function checkSubscription() {
            if (wallet.publicKey) {
                const user = await UserService.getUser(wallet.publicKey.toString())
                setIsSubscribed(user?.isSubscribed || false)
            }
        }
        checkSubscription()
    }, [wallet.publicKey])

    const [formData, setFormData] = useState<TokenFormData>({
        name: '',
        symbol: '',
        description: '',
        image: null,
        supply: 0,
        totalSupply: new BN(0),
        websiteUrl: '',
        twitterUrl: '',
        docsUrl: '',
        telegramUrl: '',
        curveConfig: {
            migrationStatus: 'active',
            isSubscribed: isSubscribed,
            developer: wallet.publicKey?.toString() || ''
        },
        projectCategory: projectData?.category || '',
        teamMembers: projectData?.teamMembers || [],
        isAnonymous: projectData?.isAnonymous || false,
        projectTitle: projectData?.projectTitle || '',
        projectDescription: projectData?.projectDescription || '',
        projectStory: projectData?.projectStory || ''
    })

    useEffect(() => {
        if (projectData) {
            setFormData(prev => ({
                ...prev,
                projectCategory: projectData.category,
                teamMembers: projectData.teamMembers,
                isAnonymous: projectData.isAnonymous,
                projectTitle: projectData.projectTitle,
                projectDescription: projectData.projectDescription,
                projectStory: projectData.projectStory
            }));
        }
    }, [projectData]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                setError('Please upload an image file')
                return
            }
            // Validate file size (e.g., 5MB limit)
            if (file.size > 5 * 1024 * 1024) {
                setError('Image must be less than 5MB')
                return
            }

            setImageFile(file)
            setImagePreview(URL.createObjectURL(file))
            setError(null)
        }
    }

    const validateForm = (): boolean => {
        if (!wallet.publicKey) {
            setError('Please connect your wallet')
            return false
        }
        if (!formData.name.trim()) {
            setError('Token name is required')
            return false
        }
        if (!formData.symbol.trim()) {
            setError('Token symbol is required')
            return false
        }
        if (formData.symbol.length > 10) {
            setError('Token symbol must be 10 characters or less')
            return false
        }
        const supply = parseInt(formData.totalSupply.toString()) / (10 ** TOKEN_DECIMALS);
        if (supply < MIN_SUPPLY) {
            setError(`Minimum supply is ${MIN_SUPPLY} tokens`)
            return false
        }
        if (supply > MAX_SUPPLY) {
            setError(`Maximum supply is ${MAX_SUPPLY.toLocaleString()} tokens`)
            return false
        }
        return true
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!validateForm()) return

        setIsLoading(true)
        setError(null)
        setSuccess(false)
        setUploadingImage(true)

        try {
            // Upload image to IPFS if provided
            let imageUrl = ''
            if (imageFile) {
                imageUrl = await pinataService.uploadImage(imageFile)
            }

            // Create metadata
            const metadata = {
                name: formData.name,
                symbol: formData.symbol,
                description: formData.description,
                image: imageUrl,
                attributes: []
            }

            // Upload metadata to IPFS
            const metadataUri = await pinataService.uploadMetadata(metadata)

            const params: createTokenParams = {
                name: formData.name,
                symbol: formData.symbol,
                totalSupply: formData.totalSupply,
                metadataUri: metadataUri,
                tokenSeed: Math.random().toString(36).substring(2, 10),
                curveConfig: {
                    migrationStatus: 'active',
                    isSubscribed: isSubscribed,
                    developer: wallet.publicKey!.toString()
                }
            }

            const projectData = {
                category: formData.projectCategory,
                teamMembers: formData.teamMembers,
                isAnonymous: formData.isAnonymous,
                projectTitle: formData.projectTitle,
                projectDescription: formData.projectDescription,
                projectStory: formData.projectStory
            }

            const result = await tokenTransactionService.createToken(
                params,
                formData.description,
                {
                    websiteUrl: formData.websiteUrl,
                    twitterUrl: formData.twitterUrl,
                    docsUrl: formData.docsUrl,
                    telegramUrl: formData.telegramUrl
                },
                projectData
            );

            if (!result || !result.mintAddress) {
                throw new Error('Transaction failed - invalid result')
            }

            const mintAccount = await connection.getAccountInfo(new PublicKey(result.mintAddress))
            if (!mintAccount) {
                throw new Error('Failed to verify mint account creation')
            }

            setSuccess(true)
            onSuccess?.()
            onTokenCreated?.()
            navigate(`/token/${result.mintAddress}`)
        } catch (error: any) {
            console.error('Token creation failed:', error)
            setError(error.message || 'Failed to create token')
        } finally {
            setIsLoading(false)
            setUploadingImage(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="token-creation-form">
            <div className="max-h-[80vh] overflow-y-auto">
                <h2>Create New Token</h2>

                {error && (
                    <div className="alert error">
                        <p>{error}</p>
                    </div>
                )}

                {success && (
                    <div className="alert success">
                        <p>Token created successfully!</p>
                    </div>
                )}

                <div className="form-group">
                    <label>Token Name</label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter token name"
                        required
                    />
                </div>

                <div className="form-group">
                    <label>Symbol</label>
                    <input
                        type="text"
                        value={formData.symbol}
                        onChange={e => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                        placeholder="Enter token symbol"
                        maxLength={10}
                        required
                    />
                </div>

                <div className="form-group">
                    <label>Description</label>
                    <textarea
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Enter token description"
                    />
                </div>

                <div className="form-group">
                    <label>Supply</label>
                    <input
                        type="text"
                        onChange={e => {
                            const rawValue = e.target.value.replace(/[^0-9]/g, '');

                            try {
                                const numberValue = rawValue ? parseInt(rawValue) : 0;
                                const actualTokens = numberValue;

                                if (actualTokens < MIN_SUPPLY) {
                                    setSupplyError(`Minimum supply is ${MIN_SUPPLY} tokens`);
                                } else if (actualTokens > MAX_SUPPLY) {
                                    setSupplyError(`Maximum supply is ${MAX_SUPPLY.toLocaleString()} tokens`);
                                } else {
                                    setSupplyError(null);
                                }

                                // Format display value with commas
                                const formatted = rawValue ? numberValue.toLocaleString('en-US') : '';
                                e.target.value = formatted;

                                // Handle BN creation
                                if (rawValue) {
                                    try {
                                        const decimalMultiplier = '1' + '0'.repeat(TOKEN_DECIMALS);
                                        const totalAmount = new BN(rawValue).mul(new BN(decimalMultiplier));

                                        setFormData({
                                            ...formData,
                                            totalSupply: totalAmount
                                        });
                                    } catch (bnError) {
                                        console.error('BN creation error:', bnError);
                                        setSupplyError('Number too large to process');
                                    }
                                } else {
                                    setFormData({
                                        ...formData,
                                        totalSupply: new BN(0)
                                    });
                                }
                            } catch (err) {
                                console.error('Error processing supply:', err);
                                setSupplyError('Invalid supply amount');
                            }
                        }}
                        placeholder="Enter total supply"
                        required
                    />
                    {supplyError && (
                        <div className="error-message">
                            {supplyError}
                        </div>
                    )}
                </div>

                <div className="form-group">
                    <label>Token Image</label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="file-input"
                    />
                    {imagePreview && (
                        <div className="image-preview">
                            <img
                                src={imagePreview}
                                alt="Token preview"
                                className="w-32 h-32 object-cover rounded-lg mt-2"
                            />
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => setShowMore(!showMore)}
                    className="more-options-button"
                >
                    {showMore ? '- Less Options' : '+ More Options'}
                </button>

                {showMore && (
                    <div className="additional-options">
                        <div className="form-group">
                            <label>Website URL</label>
                            <input
                                type="text"
                                value={formData.websiteUrl || ''}
                                onChange={e => setFormData({ ...formData, websiteUrl: e.target.value })}
                                placeholder="https://example.com"
                            />
                        </div>

                        <div className="form-group">
                            <label>Documentation URL</label>
                            <input
                                type="text"
                                value={formData.docsUrl || ''}
                                onChange={e => setFormData({ ...formData, docsUrl: e.target.value })}
                                placeholder="https://docs.example.com"
                            />
                        </div>

                        <div className="form-group">
                            <label>Twitter URL</label>
                            <input
                                type="text"
                                value={formData.twitterUrl || ''}
                                onChange={e => setFormData({ ...formData, twitterUrl: e.target.value })}
                                placeholder="https://twitter.com/username"
                            />
                        </div>

                        <div className="form-group">
                            <label>Telegram URL</label>
                            <input
                                type="text"
                                value={formData.telegramUrl || ''}
                                onChange={e => setFormData({ ...formData, telegramUrl: e.target.value })}
                                placeholder="https://t.me/username"
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="sticky bottom-0 bg-white pt-4 border-t">
                <button
                    type="submit"
                    disabled={isLoading || uploadingImage || !!supplyError || !!error}
                    className={`submit-button ${isLoading || uploadingImage ? 'loading' : ''}`}
                >
                    {isLoading || uploadingImage ? 'Creating...' : 'Create'}
                </button>
            </div>
        </form>
    )
} 