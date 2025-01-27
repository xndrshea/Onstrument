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
    // Get new CSRF token
    const csrfResponse = await fetch('/api/csrf-token', {
        credentials: 'include'
    });
    const { csrfToken } = await csrfResponse.json();

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
    };

    // Add auth token if exists
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        if (key && value) acc[key.trim()] = value.trim();
        return acc;
    }, {} as Record<string, string>);

    if (cookies['authToken']) {
        headers['Authorization'] = `Bearer ${cookies['authToken']}`;
    }

    return headers;
}

export async function getAuthHeaders() {
    const headers = await getFullHeaders();
    return {
        headers,
        credentials: 'include' as RequestCredentials
    };
} 