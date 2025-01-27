import { createContext } from 'react';
import { User } from '../services/userService';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    authCompleted: boolean;
    setUser: (user: User | null) => void;
    logout: () => void;
    refreshUser: () => Promise<void>;
    setIsAuthenticated: (value: boolean) => void;
}

export const AuthContext = createContext<AuthContextType>({
    user: null,
    isAuthenticated: false,
    authCompleted: false,
    setUser: () => { },
    logout: () => { },
    refreshUser: async () => { },
    setIsAuthenticated: () => { }
}); 