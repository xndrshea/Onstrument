export async function getCsrfHeaders() {
    try {
        const response = await fetch('/api/csrf-token', {
            method: 'GET',
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to fetch CSRF token');
        }

        const data = await response.json();
        return {
            'Content-Type': 'application/json',
            'X-CSRF-Token': data.csrfToken,
            credentials: 'include'
        };
    } catch (error) {
        console.error('Error fetching CSRF token:', error);
        throw error;
    }
}

export async function getFullHeaders(): Promise<Record<string, string>> {
    const csrfResponse = await fetch('/api/csrf-token', {
        credentials: 'include'
    });
    const { csrfToken } = await csrfResponse.json();

    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
    };
}

export const getAuthHeaders = async () => {
    return {
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': (await getFullHeaders())['X-CSRF-Token']
        },
        credentials: 'include' as RequestCredentials
    };
}; 