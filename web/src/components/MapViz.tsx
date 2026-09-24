import { useEffect, useState, useMemo, useCallback } from 'react';
import { Map as MapGL, Source, Layer, NavigationControl, FullscreenControl } from 'react-map-gl/maplibre';
import type { MapLayerMouseEvent } from 'react-map-gl/maplibre';
import axios from 'axios';
import 'maplibre-gl/dist/maplibre-gl.css';
import AppShell from './Layout/AppShell';
import Filters from './Dashboard/Filters';
import DetailsPanel from './Dashboard/DetailsPanel';
import { useDev } from '../contexts/DevContext';
import InspectorWrapper from './InspectorWrapper';
import type { Election, ResultItem, WinnerItem, HoverInfo } from '../types';
import { getColorForNuance, getColorForAbstention } from '../constants';

const API_URL = "/api";

const INITIAL_VIEW_STATE = {
    longitude: 2.2137,
    latitude: 46.2276,
    zoom: 5,
    pitch: 0,
    bearing: 0
};

// Recommended zoom ranges per layer for optimal performance
const LEVEL_ZOOM_BOUNDS: Record<string, { min: number; max: number; optimal: number }> = {
    departements: { min: 0, max: 8, optimal: 5 },
    circonscriptions: { min: 6, max: 11, optimal: 8 },
    communes: { min: 9, max: 14, optimal: 11 },
    bureaux: { min: 12, max: 18, optimal: 14 }
};

// Maximum number of entries in color expression to avoid performance issues
const MAX_COLOR_EXPRESSION_SIZE = 500;

export default function MapViz() {
    const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
    const [elections, setElections] = useState<Election[]>([]);
    const [selectedElection, setSelectedElection] = useState<string>('');
    const [resultsData, setResultsData] = useState<ResultItem[]>([]);
    const [winnersData, setWinnersData] = useState<WinnerItem[]>([]);
    const [level, setLevel] = useState<string>('departements');
    const [metric, setMetric] = useState<'abstention' | 'winner'>('abstention');

    // Filters
    const [filterType, setFilterType] = useState<string>('all');
    const [filterRound, setFilterRound] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Drill-down states
    const [selectedDepartement, setSelectedDepartement] = useState<string | null>(null);
    const [selectedCirconscription, setSelectedCirconscription] = useState<string | null>(null);
    const [selectedCommune, setSelectedCommune] = useState<string | null>(null);
    const [deptName, setDeptName] = useState<string | null>(null);
    const [circoName, setCircoName] = useState<string | null>(null);
    const [communeName, setCommuneName] = useState<string | null>(null);

    // Tooltip state
    const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

    // Fetch Elections
    useEffect(() => {
        axios.get(`${API_URL}/elections/`)
            .then(res => {
                const data = res.data as { elections: Election[] };
                setElections(data.elections);
                if (data.elections.length > 0) setSelectedElection(data.elections[0].id);
            });
    }, []);

    // Fetch Results
    useEffect(() => {
        if (!selectedElection) return;
        const apiLevel = level === 'departements' ? 'departement' :
            level === 'circonscriptions' ? 'circonscription' :
                level === 'communes' ? 'commune' : 'bureau';

        const params: Record<string, string> = { level: apiLevel };
        if (selectedDepartement) params.code_departement = selectedDepartement;
        if (selectedCirconscription) params.code_circonscription = selectedCirconscription;
        if (selectedCommune) params.code_commune = selectedCommune;

        axios.get(`${API_URL}/elections/${selectedElection}/results`, { params })
            .then(res => {
                console.log(`Fetched ${res.data.length} results for ${level}`);
                setResultsData(res.data);
            });

        if (metric === 'winner') {
            axios.get(`${API_URL}/elections/${selectedElection}/winners`, { params })
                .then(res => setWinnersData(res.data));
        }
    }, [selectedElection, level, selectedDepartement, selectedCirconscription, selectedCommune, metric]);

    // O(1) Data lookup for hover/tooltip
    const dataContext = useMemo(() => {
        const rMap = new Map();
        resultsData.forEach((r) => rMap.set(String(r.code), r));
        const wMap = new Map();
        winnersData.forEach((w) => wMap.set(String(w.code), w));
        return { rMap, wMap };
    }, [resultsData, winnersData]);

    // Native MapLibre Styling Expression
    const fillColorExpression = useMemo(() => {
        if (!resultsData || resultsData.length === 0) return '#1a1a1a';

        const codeProp =
            level === 'departements' ? 'codeDepartement' :
                level === 'circonscriptions' ? 'codeCirconscription' :
                    level === 'communes' ? 'codeCommune' :
                        'id_bv'; // For bureaux

        // Group and deduplicate by code
        const colorsByCode = new Map<string, string>();

        resultsData.forEach((r) => {
            if (r.code === undefined || r.code === null) return;
            const codeStr = String(r.code);

            let color = '#333333';
            if (metric === 'abstention' && r.Inscrits > 0) {
                const abs = (r.Abstentions / r.Inscrits) * 100;
                color = getColorForAbstention(abs);
            } else if (metric === 'winner') {
                const winner = winnersData.find(w => String(w.code) === codeStr);
                if (winner && winner.Nuance) {
                    color = getColorForNuance(winner.Nuance);
                }
            }
            colorsByCode.set(codeStr, color);
        });

        if (colorsByCode.size === 0) return '#1a1a1a';

        // Limit expression size for performance and stability
        const sortedEntries = Array.from(colorsByCode.entries());
        if (sortedEntries.length > MAX_COLOR_EXPRESSION_SIZE) {
            // For large datasets, use a simpler approach - limit to first N entries
            // In practice, this triggers viewport-based loading
            console.warn(`Color expression limited from ${sortedEntries.length} to ${MAX_COLOR_EXPRESSION_SIZE} entries`);
            sortedEntries.length = MAX_COLOR_EXPRESSION_SIZE;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const expr: any[] = ['match', ['get', codeProp]];
        sortedEntries.forEach(([code, color]) => {
            expr.push(code, color);
        });
        expr.push('#1a1a1a'); // default color

        return expr;
    }, [resultsData, winnersData, metric, level]);

    // Handle Click
    const onMapClick = useCallback((event: MapLayerMouseEvent) => {
        const feature = event.features && event.features[0];
        if (!feature) return;

        const p = feature.properties;
        const currentInFiles = elections.find(e => e.id === selectedElection)?.available_levels || ['departements', 'circonscriptions', 'communes', 'bureaux'];

        let nextLevel = '';
        if (level === 'departements') {
            setSelectedDepartement(p.codeDepartement);
            setDeptName(p.nomDepartement);
            if (currentInFiles.includes('circonscriptions')) nextLevel = 'circonscriptions';
            else if (currentInFiles.includes('communes')) nextLevel = 'communes';
        } else if (level === 'circonscriptions') {
            setSelectedCirconscription(String(p.codeCirconscription).padStart(4, '0'));
            setCircoName(p.nomCirconscription);
            if (currentInFiles.includes('communes')) nextLevel = 'communes';
        } else if (level === 'communes') {
            setSelectedCommune(String(p.codeCommune));
            setCommuneName(p.nomCommune);
            if (currentInFiles.includes('bureaux')) nextLevel = 'bureaux';
        }

        if (nextLevel && event.lngLat) {
            const zoomBounds = LEVEL_ZOOM_BOUNDS[nextLevel];
            setViewState(prev => ({
                ...prev,
                longitude: event.lngLat.lng,
                latitude: event.lngLat.lat,
                zoom: Math.max(prev.zoom, zoomBounds?.optimal ?? prev.zoom + 2)
            }));
            setLevel(nextLevel);
        }
    }, [level, elections, selectedElection]);

    // Hover UI
    const onHover = useCallback((event: MapLayerMouseEvent) => {
        const feature = event.features && event.features[0];
        if (feature) {
            const p = feature.properties;
            let key = "";
            if (level === "departements") key = String(p.codeDepartement);
            else if (level === "circonscriptions") key = String(p.codeCirconscription).padStart(4, '0');
            else if (level === "communes") key = String(p.codeCommune);

            const result = dataContext.rMap.get(key);
            const winner = dataContext.wMap.get(key);

            setHoverInfo({
                x: event.point.x,
                y: event.point.y,
                name: p.nomDepartement || p.nomCommune || (p.codeCirconscription ? `Circo ${p.codeCirconscription}` : "Area"),
                result,
                winner
            });
        } else {
            setHoverInfo(null);
        }
    }, [level, dataContext]);

    // Resets
    const resetToDepartements = () => {
        setLevel('departements');
        setSelectedDepartement(null);
        setSelectedCirconscription(null);
        setSelectedCommune(null);
        setDeptName(null);
        setCircoName(null);
        setCommuneName(null);
        setViewState(INITIAL_VIEW_STATE);
    };

    const resetToCirconscriptions = () => {
        setLevel('circonscriptions');
        setSelectedCirconscription(null);
        setSelectedCommune(null);
        setCircoName(null);
        setCommuneName(null);
        setViewState(prev => ({ ...prev, zoom: Math.max(prev.zoom - 2, 7) }));
    };

    const resetToCommunes = () => {
        setLevel('communes');
        setSelectedCommune(null);
        setCommuneName(null);
        setViewState(prev => ({ ...prev, zoom: Math.max(prev.zoom - 2, 9) }));
    };

    const tileUrl = `${window.location.origin}${API_URL}/tiles/${level}/{z}/{x}/{y}?code_departement=${selectedDepartement || ''}&code_circonscription=${selectedCirconscription || ''}&code_commune=${selectedCommune || ''}`;

    const { isDevMode, toggleDevMode } = useDev();

    const handleSearchResult = (result: any) => {
        if (result.level === 'departement') {
            setLevel('circonscriptions');
            setSelectedDepartement(result.code);
            setDeptName(result.label);
        } else if (result.level === 'commune') {
            const deptCode = result.code.substring(0, 2);
            setSelectedDepartement(deptCode);
            setSelectedCommune(result.code);
            setCommuneName(result.label);
            setLevel('bureaux');
        }
    };

    return (
        <AppShell
            title="Transparence"
            sidebar={<Filters
                filterType={filterType} setFilterType={setFilterType}
                filterRound={filterRound} setFilterRound={setFilterRound}
                selectedElection={selectedElection} setSelectedElection={setSelectedElection}
                level={level} setLevel={setLevel}
                metric={metric} setMetric={setMetric}
                elections={elections}
                selectedDepartement={selectedDepartement} deptName={deptName}
                selectedCirconscription={selectedCirconscription} circoName={circoName}
                selectedCommune={selectedCommune} communeName={communeName}
                resetToDepartements={resetToDepartements}
                resetToCirconscriptions={resetToCirconscriptions}
                resetToCommunes={resetToCommunes}
                searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                onSelectSearchResult={handleSearchResult}
            />}
            panel={<DetailsPanel
                selectedElection={selectedElection}
                level={level}
                metric={metric}
                selectedDepartement={selectedDepartement}
                selectedCirconscription={selectedCirconscription}
                selectedCommune={selectedCommune}
                setSelectedElection={setSelectedElection}
                setLevel={setLevel}
                setMetric={setMetric}
            />}
        >
            <InspectorWrapper name="MapLibre Container" fullSize={true}>
                <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
                    <MapGL
                        {...viewState}
                        onMove={evt => setViewState(evt.viewState)}
                        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
                        style={{ width: '100%', height: '100%' }}
                        onClick={onMapClick}
                        onMouseMove={onHover}
                        interactiveLayerIds={['election-layer']}
                    >
                        <Source
                            key={`${level}-${selectedDepartement}-${selectedCirconscription}-${selectedCommune}`}
                            id="election-source"
                            type="vector"
                            tiles={[tileUrl]}
                        >
                            <Layer
                                id="election-layer"
                                type="fill"
                                source-layer={level}
                                minzoom={LEVEL_ZOOM_BOUNDS[level]?.min ?? 0}
                                maxzoom={LEVEL_ZOOM_BOUNDS[level]?.max ?? 18}
                                paint={{
                                    'fill-color': fillColorExpression as any,
                                    'fill-opacity': 0.7,
                                    'fill-outline-color': '#ffffff'
                                }}
                            />
                        </Source>

                        <NavigationControl position="top-right" />
                        <FullscreenControl position="top-right" />
                    </MapGL>

                    {hoverInfo && (
                        <div className="glass-panel" style={{
                            position: 'absolute', zIndex: 100, pointerEvents: 'none',
                            left: hoverInfo.x + 10, top: hoverInfo.y + 10,
                            padding: '8px', minWidth: '150px', border: '1px solid rgba(255,255,255,0.2)'
                        }}>
                            <div style={{ fontWeight: 800, marginBottom: '4px' }}>{hoverInfo.name}</div>
                            {hoverInfo.result && (
                                <div style={{ fontSize: '0.8rem' }}>
                                    Abstention: {((hoverInfo.result.Abstentions / hoverInfo.result.Inscrits) * 100).toFixed(1)}%
                                </div>
                            )}
                        </div>
                    )}

                    <div onClick={toggleDevMode} style={{
                        position: 'absolute', bottom: 20, left: 20, zIndex: 99,
                        width: 40, height: 40, background: isDevMode ? '#ff00ff' : 'rgba(255,255,255,0.1)',
                        borderRadius: '50%', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center'
                    }}>
                        {isDevMode ? '🔧' : '🐞'}
                    </div>
                </div>
            </InspectorWrapper>
        </AppShell>
    );
}
