/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, type ReactNode } from 'react';


interface DevContextType {
    isDevMode: boolean;
    toggleDevMode: () => void;
}

const DevContext = createContext<DevContextType | undefined>(undefined);

export const DevProvider = ({ children }: { children: ReactNode }) => {
    const [isDevMode, setIsDevMode] = useState(false);

    const toggleDevMode = () => {
        setIsDevMode(prev => !prev);
    };

    return (
        <DevContext.Provider value={{ isDevMode, toggleDevMode }}>
            {children}
        </DevContext.Provider>
    );
};

export const useDev = () => {
    const context = useContext(DevContext);
    if (!context) {
        throw new Error("useDev must be used within a DevProvider");
    }
    return context;
};
