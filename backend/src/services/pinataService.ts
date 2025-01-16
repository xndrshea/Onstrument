import axios from 'axios';
import { config } from '../config/env';
import type { Request } from 'express';
import FormData from 'form-data';

export const pinataService = {
    async uploadImage(file: Request['file']): Promise<string> {
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
                }
            }
        );

        return `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`;
    },

    async uploadMetadata(metadata: any): Promise<string> {
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
    }
};
