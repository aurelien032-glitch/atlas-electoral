import React, { useState, useEffect } from 'react';
import './AppShell.css';

interface AppShellProps {
    children: React.ReactNode; // The Map
    sidebar: React.ReactNode;  // Desktop Filters
    panel: React.ReactNode;    // Right/Bottom Details (Charts)
    title?: string;
}

export default function AppShell({ children, sidebar, panel, title = "Transparence" }: AppShellProps) {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Toggle Mobile Panel (Bottom Sheet)
    const togglePanel = () => setMobilePanelOpen(!mobilePanelOpen);

    return (
        <div className="shell-container">
            {/* Top Bar (Mobile Only) */}
            {isMobile && (
                <div className="shell-header">
                    <span className="shell-title">{title}</span>
                    <button className="shell-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
                        {sidebarOpen ? '✕' : '☰'}
                    </button>
                </div>
            )}

            {/* Sidebar (Desktop: Left, Mobile: Overlay) */}
            <div className={`shell-sidebar ${sidebarOpen ? 'open' : 'closed'} ${isMobile ? 'mobile' : ''}`}>
                {!isMobile && (
                    <div className="sidebar-header">
                        <span className="app-logo">🇫🇷</span>
                        <span className="app-name">{title}</span>
                    </div>
                )}
                <div className="sidebar-content">
                    {sidebar}
                </div>
                {!isMobile && (
                    <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
                        {sidebarOpen ? '◀' : '▶'}
                    </button>
                )}
            </div>

            {/* Main Content (The Map) */}
            <main className="shell-main">
                {children}
            </main>

            {/* Right Panel (Desktop: Sidebar, Mobile: Bottom Sheet) */}
            <div className={`shell-panel ${isMobile ? 'mobile-sheet' : 'desktop-right'} ${mobilePanelOpen ? 'open' : ''}`}>

                {/* Mobile Handle to drag/toggle */}
                {isMobile && (
                    <div className="sheet-handle" onClick={togglePanel}>
                        <div className="handle-bar"></div>
                    </div>
                )}

                <div className="panel-content">
                    {panel}
                </div>

                {/* Mobile Floating Button to open panel if closed */}
                {isMobile && !mobilePanelOpen && (
                    <button className="fab-details" onClick={() => setMobilePanelOpen(true)}>
                        📊
                    </button>
                )}
            </div>
        </div>
    );
}
