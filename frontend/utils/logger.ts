export const logger = {
    error: (message: string, error?: unknown) => {
        console.error(message, error);
    },
    // Add other log levels as needed (info, warn, debug, etc.)
};