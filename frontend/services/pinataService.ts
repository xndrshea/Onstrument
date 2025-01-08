import axios from 'axios';

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;

if (!PINATA_JWT) {
    // More detailed error message
    console.error('Environment variables available:', Object.keys(import.meta.env));
    throw new Error('PINATA_JWT is not configured in environment variables');
}

export const pinataService = {
    async uploadImage(file: File): Promise<string> {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const metadata = JSON.stringify({
                name: file.name,
                keyvalues: {
                    type: 'token_image'
                }
            });
            formData.append('pinataMetadata', metadata);

            console.log('Using JWT:', PINATA_JWT?.substring(0, 20) + '...'); // Debug log

            const res = await axios.post(
                "https://api.pinata.cloud/pinning/pinFileToIPFS",
                formData,
                {
                    headers: {
                        'Authorization': `Bearer ${PINATA_JWT}`,
                        'Content-Type': 'multipart/form-data'
                    }
                }
            );

            return `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`;
        } catch (error: any) {
            console.error('Pinata upload error:', error.response?.data || error);
            throw error;
        }
    },

    async uploadMetadata(metadata: any): Promise<string> {
        try {
            const res = await axios.post(
                "https://api.pinata.cloud/pinning/pinJSONToIPFS",
                metadata,
                {
                    headers: {
                        'Authorization': `Bearer ${PINATA_JWT}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`;
        } catch (error: any) {
            console.error('Pinata metadata upload error:', error.response?.data || error);
            throw error;
        }
    }
}; 