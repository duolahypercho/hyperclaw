"use client";

import React, { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";

interface PricingModalContextType {
    isOpen: boolean;
    openModal: () => void;
    closeModal: () => void;
}

const PricingModalContext = createContext<PricingModalContextType | undefined>(
    undefined
);

export const PricingModalProvider = ({ children }: { children: ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);

    const openModal = useCallback(() => setIsOpen(true), []);
    const closeModal = useCallback(() => setIsOpen(false), []);

    const value = useMemo(() => ({ isOpen, openModal, closeModal }), [isOpen, openModal, closeModal]);

    return (
        <PricingModalContext.Provider value={value}>
            {children}
        </PricingModalContext.Provider>
    );
};

export const usePricingModal = () => {
    const context = useContext(PricingModalContext);
    if (context === undefined) {
        throw new Error(
            "usePricingModal must be used within a PricingModalProvider"
        );
    }
    return context;
};
