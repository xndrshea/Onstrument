export const pinataService = {
    async uploadImage(file: File): Promise<string> {
        const formData = new FormData();
        formData.append('file', file);

        const url = `/api/upload/image`;
        console.log('Attempting upload to:', url);

        const response = await fetch(url, {
            method: 'POST',
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
        const response = await fetch(`/api/upload/metadata`, {
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
