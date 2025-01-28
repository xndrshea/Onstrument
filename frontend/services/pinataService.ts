import { getAuthHeaders, getFullHeaders } from '../utils/headers';

export const pinataService = {
    async uploadImage(file: File): Promise<string> {
        const formData = new FormData();
        formData.append('file', file);

        const url = `/api/upload/image`;
        console.log('Attempting upload to:', url);

        const headers = await getFullHeaders();
        delete headers['Content-Type']; // Remove only the Content-Type, keep CSRF token

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'Accept': 'application/json',
            },
            credentials: 'include',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Upload failed:', errorText);
            throw new Error('Failed to upload image');
        }

        const data = await response.json();
        return data.url;
    },

    async uploadMetadata(metadata: any): Promise<string> {
        try {
            const headers = await getFullHeaders();
            const response = await fetch(`/api/upload/metadata`, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(metadata),
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.error || errorJson.message || errorText;
                } catch {
                    errorMessage = errorText;
                }

                console.error('Metadata upload failed:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorMessage
                });

                throw new Error(`Failed to upload metadata: ${response.status} ${errorMessage}`);
            }

            const data = await response.json();
            if (!data.url) {
                throw new Error('Invalid response: missing URL');
            }

            return data.url;
        } catch (error) {
            console.error('Metadata upload error:', error);
            throw error;
        }
    }
};
