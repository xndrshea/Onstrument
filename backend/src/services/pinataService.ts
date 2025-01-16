import axios from 'axios';
import { config } from '../config/env';
import type { Request } from 'express';

export const pinataService = {
    async uploadImage(file: Request['file']): Promise<string> {
        if (!file) throw new Error('No file provided');

        const formData = new FormData();
        formData.append('file', new Blob([file.buffer]), file.originalname);

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
                    'Authorization': `Bearer ${config.PINATA_JWT}`,
                    'Content-Type': 'multipart/form-data'
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