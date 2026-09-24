import InspectorWrapper from '../InspectorWrapper';
import Charts from '../Charts';

const API_URL = "/api";

interface PanelProps {
    selectedElection: string;
    level: string;
    metric: 'abstention' | 'winner';

    selectedDepartement: string | null;
    selectedCirconscription: string | null;
    selectedCommune: string | null;

    // Setters for inspector
    setSelectedElection?: (val: string) => void;
    setLevel?: (val: string) => void;
    setMetric?: (val: 'abstention' | 'winner') => void;

    // Allow loose typing for Inspector compatibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setters?: Record<string, (val: any) => void>;
}

export default function DetailsPanel({
    selectedElection, level, metric,
    selectedDepartement, selectedCirconscription, selectedCommune,
    setSelectedElection, setLevel, setMetric, setters
}: PanelProps) {
    if (!selectedElection) return <div style={{ padding: '20px', opacity: 0.5 }}>Sélectionnez une élection...</div>;

    return (
        <InspectorWrapper
            name="Charts & Graphs"
            dataSources={[
                { url: `${API_URL}/history/nuance`, note: 'History API' },
                { url: `${API_URL}/candidates`, note: 'Candidate Distribution' }
            ]}
            relations={{ selectedElection, level, metric }}
            setters={setters || (setSelectedElection && setLevel && setMetric ? { selectedElection: setSelectedElection, level: setLevel, metric: setMetric } : {})}
        >
            <div style={{ padding: '10px' }}>
                <h2 style={{ fontSize: '1.1rem', marginBottom: '10px' }}>Résultats Detaillés</h2>
                <Charts
                    electionId={selectedElection}
                    level={
                        level === 'departements' ? 'national' :
                            level === 'circonscriptions' ? 'departement' :
                                level === 'communes' ? 'circonscription' : 'commune'
                    }
                    codeDepartement={selectedDepartement}
                    codeCirconscription={selectedCirconscription}
                    codeCommune={selectedCommune}
                />
            </div>
        </InspectorWrapper >
    );
}
