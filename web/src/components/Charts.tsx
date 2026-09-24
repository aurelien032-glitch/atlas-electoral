import { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import axios from 'axios';
import type { ChartHistoryItem, NuanceItem } from '../types';
import { getColorForNuance, NUANCE_LABELS } from '../constants';

const API_URL = "/api";

interface ChartsProps {
    electionId: string;
    level: string;
    codeDepartement?: string | null;
    codeCirconscription?: string | null;
    codeCommune?: string | null;
}

// Use centralized getColorForNuance from constants.ts
const getNuanceColor = (nuance: string): string | undefined => {
    const color = getColorForNuance(nuance);
    // Return undefined for ECharts to use its own palette if we get the default 'other' color
    return color !== '#969696' ? color : undefined;
};

const formatNumber = (num: number) => {
    return new Intl.NumberFormat('fr-FR').format(num);
}

export default function Charts({ electionId, level, codeDepartement, codeCirconscription, codeCommune }: ChartsProps) {
    const [activeTab, setActiveTab] = useState<'abstention' | 'nuance'>('abstention');
    const [historyData, setHistoryData] = useState<ChartHistoryItem[]>([]);
    const [nuanceData, setNuanceData] = useState<NuanceItem[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [nuanceHistoryData, setNuanceHistoryData] = useState<{ years: string[], series: { name: string; data: number[] }[] } | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [resultsData, setResultsData] = useState<any>(null); // resultsData structure varies by level (array vs object?) - checking usage: it seems to be an object in render

    useEffect(() => {
        if (!electionId) return;

        const parts = electionId.split('_');
        const type = parts[1];

        const baseParams: any = { level };
        if (codeDepartement) baseParams.code_departement = codeDepartement;
        if (codeCirconscription) baseParams.code_circonscription = codeCirconscription;
        if (codeCommune) baseParams.code_commune = codeCommune;

        // 1. Fetch History (Chronological)
        axios.get(`${API_URL}/elections/history`, { params: { ...baseParams, type } })
            .then((res) => {
                const data: any[] = res.data;
                const formatted = data.map((d: any) => ({
                    year: d.year,
                    abstention: d.Inscrits ? parseFloat(((d.Abstentions / d.Inscrits) * 100).toFixed(2)) : 0,
                    participation: d.Inscrits ? parseFloat(((d.Votants / d.Inscrits) * 100).toFixed(2)) : 0,
                }));
                // Sort by year to be safe
                formatted.sort((a: any, b: any) => parseInt(a.year) - parseInt(b.year));
                setHistoryData(formatted);
            })
            .catch((err: any) => console.error("Error fetching history data:", err));

        // 2. Fetch nuance distribution
        axios.get(`${API_URL}/elections/${electionId}/candidates`, { params: baseParams })
            .then((res: any) => {
                // Calculate percentage manually
                const total = res.data.reduce((acc: number, curr: any) => acc + curr.voix, 0);
                const enriched = res.data.map((d: any) => ({
                    ...d,
                    percent: total ? ((d.voix / total) * 100).toFixed(1) : 0,
                    fullName: NUANCE_LABELS[d.Nuance] || d.Nuance
                }));
                setNuanceData(enriched);
            })
            .catch((err: any) => console.error("Error fetching nuance data:", err));

        // 3. NEW: Fetch Nuance History (for Context)
        axios.get(`${API_URL}/elections/history/nuance`, { params: { ...baseParams, type } })
            .then((res: any) => {
                setNuanceHistoryData(res.data); // Store { years: [], series: [] }
            })
            .catch((err: any) => console.error("Error fetching nuance history:", err));

        // 4. Fetch specific results (for Abstention Pie)
        axios.get(`${API_URL}/elections/${electionId}/results`, { params: baseParams })
            .then((res: any) => {
                // Warning: API returns an array (e.g. all departments). We must find the right one.
                let match = null;
                if (level === 'national') {
                    match = res.data[0]; // Usually only 1 row or 'FR'
                } else if (level === 'departement') {
                    match = res.data.find((d: any) => d.code === codeDepartement);
                } else if (level === 'circonscription') {
                    match = res.data.find((d: any) => d.code === codeCirconscription);
                } else if (level === 'commune') {
                    match = res.data.find((d: any) => d.code === codeCommune);
                }
                setResultsData(match || res.data[0]); // Fallback to first if strict match fails (safeguard)
            })
            .catch((err: any) => console.error("Error fetching results data:", err));

    }, [electionId, level, codeDepartement, codeCirconscription, codeCommune]);



    const getEvolutionOption = (title: string, showLegend: boolean = true) => ({
        backgroundColor: 'transparent',
        title: { text: title, textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 'bold' }, left: 'center', top: 5 },
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(20, 20, 30, 0.9)', borderColor: 'rgba(255, 255, 255, 0.1)', textStyle: { color: '#fff' } },
        grid: { left: '5%', right: '5%', bottom: '5%', top: '25%', containLabel: true },
        xAxis: { type: 'category', data: historyData.map(d => d.year), axisLabel: { color: '#ccc', fontSize: 9 } },
        yAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } }, axisLabel: { color: '#aaa', fontSize: 9 } },
        series: [
            { name: 'Abstention', type: 'line', smooth: true, itemStyle: { color: '#ff6b6b' }, data: historyData.map(d => d.abstention), symbolSize: 6 },
            { name: 'Participation', type: 'line', smooth: true, itemStyle: { color: '#4ecdc4' }, data: historyData.map(d => d.participation), symbolSize: 6 }
        ],
        legend: showLegend ? { bottom: 0, textStyle: { color: '#aaa', fontSize: 9 }, itemWidth: 10, itemHeight: 10 } : { show: false }
    });

    const getNuanceEvolutionOption = () => {
        if (!nuanceHistoryData || !nuanceHistoryData.years) return null;
        return {
            backgroundColor: 'transparent',
            title: { text: 'ÉVOLUTION POLITIQUE (1er Tour)', textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 'bold' }, left: 'center', top: 5 },
            tooltip: { trigger: 'axis', backgroundColor: 'rgba(20, 20, 30, 0.9)', borderColor: 'rgba(255, 255, 255, 0.1)', textStyle: { color: '#fff' } },
            grid: { left: '5%', right: '5%', bottom: '5%', top: '25%', containLabel: true },
            xAxis: { type: 'category', data: nuanceHistoryData.years, axisLabel: { color: '#ccc', fontSize: 9 } },
            yAxis: { type: 'value', min: 0, max: 'dataMax', splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } }, axisLabel: { color: '#aaa', fontSize: 9 } },
            series: nuanceHistoryData.series.map((s: any) => ({
                name: s.name,
                type: 'line',
                smooth: true,
                symbol: 'none',
                itemStyle: { color: getNuanceColor(s.name) }, // Auto-color matching
                data: s.data
            })),
            legend: { bottom: 0, type: 'scroll', textStyle: { color: '#aaa', fontSize: 9 }, itemWidth: 10, itemHeight: 10 }
        };
    };

    const abstentionPieOption = resultsData ? {
        backgroundColor: 'transparent',
        title: { text: 'RÉPARTITION (PARTICIPATION)', textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 'bold' }, left: 'center', top: 5 },
        tooltip: { trigger: 'item' },
        series: [{
            type: 'pie',
            radius: ['45%', '70%'],
            center: ['50%', '55%'],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 4, borderColor: '#000', borderWidth: 1 },
            label: { show: false },
            data: [
                { value: resultsData.Abstentions, name: 'Abstentions', itemStyle: { color: '#ff6b6b' } },
                { value: resultsData.Votants, name: 'Votants', itemStyle: { color: '#4ecdc4' } },
                { value: resultsData.Blancs, name: 'Blancs', itemStyle: { color: '#eee' } },
                { value: resultsData.Nuls, name: 'Nuls', itemStyle: { color: '#999' } }
            ]
        }]
    } : null;



    const nuancePieOption = {
        backgroundColor: 'transparent',
        title: { text: 'RÉPARTITION DES NUANCES', textStyle: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 'bold' }, left: 'center', top: 5 },
        tooltip: { trigger: 'item' },
        series: [{
            type: 'pie',
            radius: ['35%', '60%'], // Smaller radius to fit
            center: ['50%', '50%'],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 4, borderColor: '#000', borderWidth: 1 },
            label: { show: false },
            data: nuanceData.map(d => ({
                value: d.voix,
                name: d.Nuance,
                itemStyle: { color: getNuanceColor(d.Nuance) }
            }))
        }]
    };

    return (
        <div id="charts-panel" className="glass-panel" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header / Tabs */}
            <div id="charts-tabs" style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0 10px', flexShrink: 0 }}>
                <button
                    id="tab-abstention"
                    onClick={() => setActiveTab('abstention')}
                    style={{
                        flex: 1, padding: '12px', background: 'transparent', border: 'none', color: '#fff',
                        opacity: activeTab === 'abstention' ? 1 : 0.5,
                        borderBottom: activeTab === 'abstention' ? '2px solid #4ecdc4' : '2px solid transparent',
                        cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', transition: 'all 0.2s'
                    }}>
                    ABSTENTION
                </button>
                <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '10px 0' }}></div>
                <button
                    id="tab-nuance"
                    onClick={() => setActiveTab('nuance')}
                    style={{
                        flex: 1, padding: '12px', background: 'transparent', border: 'none', color: '#fff',
                        opacity: activeTab === 'nuance' ? 1 : 0.5,
                        borderBottom: activeTab === 'nuance' ? '2px solid #ffd166' : '2px solid transparent',
                        cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', transition: 'all 0.2s'
                    }}>
                    NUANCES
                </button>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '15px', gap: '15px', overflowY: 'auto' }}>
                {activeTab === 'abstention' ? (
                    <>
                        <div id="chart-abstention-pie" style={{ minHeight: '200px', position: 'relative' }}>
                            {abstentionPieOption && <ReactECharts option={abstentionPieOption} style={{ height: '200px', width: '100%' }} theme="dark" />}
                        </div>
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', width: '80%', margin: '0 auto', flexShrink: 0 }}></div>
                        <div id="chart-abstention-evolution" style={{ minHeight: '150px' }}>
                            <ReactECharts option={getEvolutionOption('ÉVOLUTION HISTORIQUE (PARTICIPATION)')} style={{ height: '200px', width: '100%' }} theme="dark" />
                        </div>
                    </>
                ) : (
                    <>
                        {/* Split Pie and List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div id="chart-nuance-pie" style={{ height: '200px' }}>
                                <ReactECharts option={nuancePieOption} style={{ height: '100%', width: '100%' }} theme="dark" />
                            </div>

                            {/* Detailed List */}
                            <div id="list-nuance-details" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {nuanceData.map((d, i) => (
                                    <div key={i} id={`row-nuance-${i}`} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: '4px',
                                        fontSize: '0.85rem'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getNuanceColor(d.Nuance), flexShrink: 0 }}></div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 600 }}>{d.fullName}</span>
                                                {/* Show Candidate Name if available */}
                                                {(d.nom || d.prenom) && (
                                                    <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                                                        {d.prenom} {d.nom}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                            <span style={{ fontWeight: 'bold' }}>{d.percent}%</span>
                                            <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{formatNumber(d.voix)} voix</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', width: '80%', margin: '15px auto', flexShrink: 0 }}></div>

                        <div id="chart-nuance-history" style={{ minHeight: '200px' }}>
                            {/* NEW: Nuance History Chart */}
                            {getNuanceEvolutionOption() && <ReactECharts option={getNuanceEvolutionOption()} style={{ height: '220px', width: '100%' }} theme="dark" />}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
