import React, { useState } from 'react';
import { useDev } from '../contexts/DevContext';

// Helper to detect type and render input
const EditInput = ({ value, onChange }: { value: unknown, onChange: (val: any) => void }) => {
    if (typeof value === 'boolean') {
        return <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />;
    }
    if (typeof value === 'number') {
        return <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} style={{ background: '#333', border: '1px solid #555', color: '#fff' }} />;
    }
    // Default text/select
    return <input type="text" value={String(value)} onChange={e => onChange(e.target.value)} style={{ background: '#333', border: '1px solid #555', color: '#fff', width: '100%' }} />;
};

interface InspectorWrapperProps {
    name: string;
    children: React.ReactNode;
    dataSources?: { url: string; note?: string }[];
    relations?: Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setters?: { [key: string]: (val: any) => void }; // New: setters for editing
    fullSize?: boolean;
}

export default function InspectorWrapper({ name, children, dataSources, relations, setters, fullSize = false }: InspectorWrapperProps) {
    const { isDevMode } = useDev();
    const [showModal, setShowModal] = useState(false);

    if (!isDevMode) {
        return <>{children}</>;
    }

    return (
        <div style={{
            position: 'relative',
            border: '2px dashed #ff00ff',
            borderRadius: '4px',
            margin: '2px',
            width: fullSize ? '100%' : 'auto',
            height: fullSize ? '100%' : 'auto'
        }} title={`Inspector: ${name}`}>
            <div
                onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
                style={{
                    position: 'absolute', top: -10, left: 0,
                    background: '#ff00ff', color: 'white',
                    padding: '2px 6px', fontSize: '10px',
                    cursor: 'pointer', zIndex: 9999, fontWeight: 'bold',
                    borderRadius: '4px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                }}
            >
                🔧 {name}
            </div>
            {children}

            {showModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center'
                }} onClick={() => setShowModal(false)}>
                    <div style={{
                        background: '#1a1a1a', border: '1px solid #444', padding: '20px', borderRadius: '8px',
                        width: '600px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto', color: '#eee', fontFamily: 'monospace',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ borderBottom: '1px solid #444', paddingBottom: '10px', marginTop: 0 }}>
                            🕵️ Component Inspector: <span style={{ color: '#ff00ff' }}>{name}</span>
                        </h3>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                                <h4 style={{ color: '#4ecdc4' }}>📡 Data Sources</h4>
                                {dataSources && dataSources.length > 0 ? (
                                    <ul style={{ background: '#000', padding: '10px', borderRadius: '4px', listStyle: 'none', margin: 0 }}>
                                        {dataSources.map((ds, i) => (
                                            <li key={i} style={{ marginBottom: '8px', wordBreak: 'break-all', display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.8em', opacity: 0.7 }}>{ds.note}</span>
                                                <a href={ds.url} target="_blank" rel="noreferrer" style={{ color: '#aaa', textDecoration: 'underline', fontSize: '0.85em' }}>
                                                    {ds.url.substring(0, 40)}...
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <div style={{ fontStyle: 'italic', opacity: 0.5 }}>None</div>}
                            </div>

                            <div>
                                <h4 style={{ color: '#ffd166' }}>🔗 State & Params</h4>
                                {relations ? (
                                    <div style={{ background: '#000', padding: '10px', borderRadius: '4px' }}>
                                        {Object.entries(relations).map(([key, value]) => (
                                            <div key={key} style={{ marginBottom: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                                    <span style={{ color: '#aaa', fontSize: '0.9em' }}>{key}</span>
                                                    <span style={{ color: '#fff', fontWeight: 'bold' }}>{String(value)}</span>
                                                </div>
                                                {/* Edit Controls */}
                                                {setters && setters[key] && (
                                                    <div style={{ marginTop: '2px' }}>
                                                        <EditInput value={value} onChange={(val) => setters[key](val)} />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : <div style={{ fontStyle: 'italic', opacity: 0.5 }}>None</div>}
                            </div>
                        </div>

                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                onClick={() => setShowModal(false)}
                                style={{ padding: '8px 16px', background: '#ff00ff', border: 'none', color: 'white', cursor: 'pointer', fontWeight: 'bold', borderRadius: '4px' }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
