interface PhantomProvider {
    isPhantom?: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    request: (args: any) => Promise<any>;
}

interface Window {
    solana?: PhantomProvider;
} 