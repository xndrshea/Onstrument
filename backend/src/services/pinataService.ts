import axios from 'axios';
import { config } from '../config/env';
import type { Request } from 'express';
import FormData from 'form-data';
import { logger } from '../utils/logger';

export const pinataService = {
    async uploadImage(file: Request['file']): Promise<string> {
        try {
            if (!file) throw new Error('No file provided');

            const formData = new FormData();
            formData.append('file', file.buffer, {
                filename: file.originalname,
                contentType: file.mimetype
            });

            const metadata = JSON.stringify({
                name: file.originalname,
                keyvalues: { type: 'token_image' }
            });
            formData.append('pinataMetadata', metadata);

            const res = await axios.post(
                "https://api.pinata.cloud/pinning/pinFileToIPFS",
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        'Authorization': `Bearer ${config.PINATA_JWT}`
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                }
            );

            if (!res.data || !res.data.IpfsHash) {
                throw new Error('Invalid response from Pinata');
            }

            return `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`;
        } catch (error) {
            logger.error('Pinata image upload failed:', {
                error: (error as any).response?.data || (error as any).message,
                status: (error as any).response?.status,
                fileInfo: {
                    filename: file?.originalname,
                    mimetype: file?.mimetype,
                    size: file?.size
                }
            });
            throw new Error('Failed to upload image to IPFS');
        }
    },

    async uploadMetadata(metadata: any): Promise<string> {
        try {
            const res = await axios.post(
                "https://api.pinata.cloud/pinning/pinJSONToIPFS",
                metadata,
                {
                    headers: {
                        'Authorization': `Bearer ${config.PINATA_JWT}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`;
        } catch (error) {
            logger.error('Pinata metadata upload failed:', {
                error: (error as any).response?.data || (error as any).message,
                status: (error as any).response?.status,
                metadata: metadata
            });
            throw new Error(`Failed to upload metadata:`);
        }
    }
};
