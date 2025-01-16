import { API_BASE_URL } from '../config';

export const pinataService = {
    async uploadImage(file: File): Promise<string> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE_URL}/upload/image`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Failed to upload image');
        }

        const data = await response.json();
        return data.url;
    },

    async uploadMetadata(metadata: any): Promise<string> {
        const response = await fetch(`${API_BASE_URL}/upload/metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(metadata),
        });

        if (!response.ok) {
            throw new Error('Failed to upload metadata');
        }

        const data = await response.json();
        return data.url;
    }
}; 