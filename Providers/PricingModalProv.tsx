"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

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

    const openModal = () => setIsOpen(true);
    const closeModal = () => setIsOpen(false);

    return (
        <PricingModalContext.Provider value={{ isOpen, openModal, closeModal }}>
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
