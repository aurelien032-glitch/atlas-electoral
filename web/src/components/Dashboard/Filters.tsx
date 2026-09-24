import React from 'react';
import InspectorWrapper from '../InspectorWrapper';
import type { Election } from '../../types';

import { NUANCE_COLORS, NUANCE_LABELS, ABSTENTION_COLORS } from '../../constants';

const API_URL = "/api";

interface FiltersProps {
    filterType: string;
    setFilterType: (val: string) => void;
    filterRound: string;
    setFilterRound: (val: string) => void;
    selectedElection: string;
    setSelectedElection: (val: string) => void;
    level: string;
    setLevel: (val: string) => void;
    metric: 'abstention' | 'winner';
    setMetric: (val: 'abstention' | 'winner') => void;
    elections: Election[];

    // Breadcrumb props
    selectedDepartement: string | null;
    deptName: string | null;
    selectedCirconscription: string | null;
    circoName: string | null;
    selectedCommune: string | null;
    communeName: string | null;

    // Actions
    resetToDepartements: () => void;
    resetToCirconscriptions: () => void;
    resetToCommunes: () => void;
    // Search Props
    searchQuery?: string;
    setSearchQuery?: (val: string) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSelectSearchResult?: (result: any) => void;
}

export default function Filters({
    filterType, setFilterType,
    filterRound, setFilterRound,
    selectedElection, setSelectedElection,
    level, setLevel,
    metric, setMetric,
    elections,
    selectedDepartement, deptName,
    selectedCirconscription, circoName,
    selectedCommune, communeName,
    resetToDepartements, resetToCirconscriptions, resetToCommunes,
    searchQuery, setSearchQuery, onSelectSearchResult
}: FiltersProps) {

    // Local state for search suggestions if logic internal or passed
    const [suggestions, setSuggestions] = React.useState<any[]>([]);
    const [isSearching, setIsSearching] = React.useState(false);

    const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (setSearchQuery) setSearchQuery(val);

        if (val.length >= 2) {
            setIsSearching(true);
            try {
                const res = await fetch(`${API_URL}/search/?q=${encodeURIComponent(val)}`);
                const data = await res.json();
                setSuggestions(data.results);
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearching(false);
            }
        } else {
            setSuggestions([]);
        }
    };

    const selectResult = (item: any) => {
        if (onSelectSearchResult) onSelectSearchResult(item);
        setSuggestions([]);
        if (setSearchQuery) setSearchQuery(""); // Clear after select? or keep name? Clear usually better for Nav.
    };



    return (
        <InspectorWrapper
            name="Filters & Legend"
            dataSources={[{ url: `${API_URL}/elections/`, note: 'List Elections' }]}
            relations={{ level, selectedElection, metric, filterType }}
            setters={{ level: setLevel, selectedElection: setSelectedElection, metric: setMetric, filterType: setFilterType }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>

                {/* Search Bar Autocomplete */}
                <div style={{ position: 'relative', zIndex: 100 }}>
                    <input
                        id="search-input"
                        type="text"
                        placeholder="Rechercher une ville, un département..."
                        style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }}
                        value={searchQuery || ''}
                        onChange={handleSearchChange}
                    />
                    <span style={{ position: 'absolute', right: 10, top: 10, opacity: 0.5 }}>{isSearching ? '...' : '🔍'}</span>

                    {/* Suggestions Dropdown */}
                    {suggestions.length > 0 && (
                        <div id="search-suggestions" className="glass-panel animate-fade-in" style={{ position: 'absolute', top: '100%', left: 0, width: '100%', maxHeight: '200px', overflowY: 'auto', background: '#1a1a1d', border: '1px solid #333', borderRadius: '8px', marginTop: '5px' }}>
                            {suggestions.map((item, idx) => (
                                <div
                                    key={idx}
                                    id={`search-result-${idx}`}
                                    onClick={() => selectResult(item)}
                                    style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <span style={{ fontSize: '0.6rem', padding: '2px 4px', borderRadius: '4px', background: item.level === 'departement' ? '#444' : '#222', textTransform: 'uppercase' }}>
                                        {item.level.substring(0, 4)}
                                    </span>
                                    <span style={{ fontSize: '0.85rem' }}>{item.label}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Breadcrumbs Navigation */}
                <div id="breadcrumbs" style={{ fontSize: '0.8rem', display: 'flex', flexWrap: 'wrap', gap: '5px', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                    <span style={{ cursor: 'pointer', opacity: level === 'departements' ? 1 : 0.6 }} onClick={resetToDepartements}>France</span>
                    {selectedDepartement && (
                        <>
                            <span>/</span>
                            <span style={{ cursor: 'pointer', opacity: level === 'circonscriptions' ? 1 : 0.6 }} onClick={resetToCirconscriptions}>{deptName || selectedDepartement}</span>
                        </>
                    )}
                    {selectedCirconscription && (
                        <>
                            <span>/</span>
                            <span style={{ cursor: 'pointer', opacity: level === 'communes' ? 1 : 0.6 }} onClick={resetToCommunes}>{circoName || selectedCirconscription}</span>
                        </>
                    )}
                    {selectedCommune && (
                        <>
                            <span>/</span>
                            <span style={{ cursor: 'pointer', opacity: 1, fontWeight: 700 }} onClick={() => setLevel('bureaux')}>{communeName || selectedCommune}</span>
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '0.75rem', opacity: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>Élection</label>
                    <div style={{ display: 'flex', gap: '5px' }}>
                        <select id="select-election-type" className="glass-input" style={{ flex: 1 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                            <option value="all">Tout type</option>
                            <option value="pres">Présidentielle</option>
                            <option value="legi">Législatives</option>
                            <option value="euro">Européennes</option>
                            <option value="regi">Régionales</option>
                            <option value="dpmt">Départementales</option>
                            <option value="muni">Municipales</option>
                        </select>
                        <select id="select-election-round" className="glass-input" style={{ width: '80px' }} value={filterRound} onChange={e => setFilterRound(e.target.value)}>
                            <option value="all">Tout</option>
                            <option value="T1">T1</option>
                            <option value="T2">T2</option>
                        </select>
                    </div>

                    <select id="select-election-id" className="glass-input" value={selectedElection} onChange={e => setSelectedElection(e.target.value)}>
                        {elections
                            .filter(e => filterType === 'all' || e.type === filterType)
                            .filter(e => filterRound === 'all' || e.round === filterRound)
                            .map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.75rem', opacity: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>Vue / Maillage</label>
                    <select id="select-level" className="glass-input" value={level} onChange={e => setLevel(e.target.value)}>
                        <option value="departements">Départements</option>
                        <option value="circonscriptions">Circonscriptions</option>
                        <option value="communes">Communes</option>
                        <option value="bureaux">Bureaux de vote</option>
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.75rem', opacity: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>Mode Carte</label>
                    <div className="glass-input" style={{ display: 'flex', padding: '2px', gap: '2px' }}>
                        <button
                            id="btn-metric-abstention"
                            onClick={() => setMetric('abstention')}
                            style={{ flex: 1, border: 'none', background: metric === 'abstention' ? 'rgba(255,255,255,0.1)' : 'transparent', color: '#fff', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                        >
                            Abstention
                        </button>
                        <button
                            id="btn-metric-winner"
                            onClick={() => setMetric('winner')}
                            style={{ flex: 1, border: 'none', background: metric === 'winner' ? 'rgba(255,255,255,0.1)' : 'transparent', color: '#fff', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                        >
                            Gagnant
                        </button>
                    </div>
                </div>

                {/* Legend */}
                <div style={{ marginTop: '10px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '8px', textTransform: 'uppercase' }}>
                        {metric === 'abstention' ? "Taux d'abstention" : "Nuance en tête"}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                        {metric === 'abstention' ? (
                            ABSTENTION_COLORS.map(item => (
                                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: item.color, opacity: 0.8 }}></div>
                                    <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{item.label}</span>
                                </div>
                            ))
                        ) : (
                            Object.entries(NUANCE_COLORS).filter(([k]) => k !== 'other' && !['FN', 'LREM', 'LFI', 'NUP', 'DXG'].includes(k)).map(([code, color]) => (
                                <div key={code} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: color, opacity: 0.8 }}></div>
                                    <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{NUANCE_LABELS[code] || code}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </InspectorWrapper>
    );
}
