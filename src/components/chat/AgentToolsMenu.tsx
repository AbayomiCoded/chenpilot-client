"use client";

import { useEffect, useRef, useState } from "react";
import { Bitcoin, Building2, CheckCircle, DollarSign, Zap } from "lucide-react";

const agentTools = [
    { name: "Soroswap", description: "Stellar DEX for token swaps", icon: Zap },
    { name: "Blend", description: "Lending and borrowing protocol", icon: DollarSign },
    { name: "Aquarius", description: "Liquidity pool management", icon: Bitcoin },
    { name: "Phoenix", description: "Advanced DeFi operations", icon: Building2 },
];

interface AgentToolsMenuProps {
    selectedTool: string | null;
    onSelect: (tool: string) => void;
}

export function AgentToolsMenu({ selectedTool, onSelect }: AgentToolsMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

    useEffect(() => {
        if (isOpen) optionRefs.current[activeIndex]?.focus();
    }, [activeIndex, isOpen]);

    const openMenu = () => {
        const selectedIndex = agentTools.findIndex((tool) => tool.name === selectedTool);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setIsOpen(true);
    };

    const closeMenu = () => {
        setIsOpen(false);
        triggerRef.current?.focus();
    };

    const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        let nextIndex: number | null = null;

        switch (event.key) {
            case "ArrowDown":
                nextIndex = (activeIndex + 1) % agentTools.length;
                break;
            case "ArrowUp":
                nextIndex = (activeIndex - 1 + agentTools.length) % agentTools.length;
                break;
            case "Home":
                nextIndex = 0;
                break;
            case "End":
                nextIndex = agentTools.length - 1;
                break;
            case "Escape":
                event.preventDefault();
                closeMenu();
                return;
            default:
                return;
        }

        event.preventDefault();
        setActiveIndex(nextIndex);
    };

    return (
        <div className="relative">
            <button
                ref={triggerRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls="agent-tools-menu"
                onClick={() => (isOpen ? closeMenu() : openMenu())}
                className={`flex items-center space-x-2 px-4 py-2 text-sm rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${selectedTool
                    ? "text-purple-300 bg-purple-600/20 border border-purple-500/30"
                    : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
                    }`}
            >
                <span className="text-lg">+</span>
                <span>Tools</span>
                {selectedTool && (
                    <span className="text-xs bg-purple-500/30 px-2 py-0.5 rounded-full ml-1">
                        {selectedTool}
                    </span>
                )}
            </button>

            <div
                id="agent-tools-menu"
                role="menu"
                aria-label="Agent tools"
                hidden={!isOpen}
                className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden z-20"
            >
                <div className="py-1">
                    {agentTools.map((tool, index) => {
                        const IconComponent = tool.icon;
                        const isSelected = selectedTool === tool.name;

                        return (
                            <button
                                key={tool.name}
                                ref={(element) => {
                                    optionRefs.current[index] = element;
                                }}
                                type="button"
                                role="menuitemradio"
                                aria-checked={isSelected}
                                tabIndex={activeIndex === index ? 0 : -1}
                                onKeyDown={handleMenuKeyDown}
                                onClick={() => {
                                    onSelect(tool.name);
                                    closeMenu();
                                }}
                                className={`w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-400 transition-colors text-left ${isSelected
                                    ? "bg-purple-600/10 border-l-2 border-purple-500"
                                    : ""
                                    }`}
                            >
                                <span className={isSelected ? "text-purple-400" : "text-gray-400"}>
                                    <IconComponent aria-hidden="true" className="h-4 w-4" />
                                </span>
                                <span className="flex-1">
                                    <span className={`block text-sm font-medium ${isSelected ? "text-purple-300" : "text-white"}`}>
                                        {tool.name}
                                    </span>
                                    <span className="block text-xs text-gray-500">
                                        {tool.description}
                                    </span>
                                </span>
                                {isSelected && (
                                    <CheckCircle aria-hidden="true" className="h-4 w-4 text-purple-400" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}