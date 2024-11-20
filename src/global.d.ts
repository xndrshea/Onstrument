declare global {
    interface Window {
        global: any;
        Buffer: typeof Buffer;
        process: any;
    }
}

export { } 