import { createContext } from 'react';
import { User } from '../services/userService';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    setUser: (user: User | null) => void;
    logout: () => void;
    refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
    user: null,
    isAuthenticated: false,
    setUser: () => { },
    logout: () => { },
    refreshUser: async () => { }
}); 