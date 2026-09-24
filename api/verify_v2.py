import duckdb
from fastapi.testclient import TestClient
from main import app
import os

# Set DB path to relative for test if needed, but main.py should handle it.
# We assume running from 'api' dir.

client = TestClient(app)

def test_search():
    print("--- Testing Search ---")
    # Test City
    response = client.get("/search/?q=Ambérieu")
    assert response.status_code == 200
    data = response.json()
    print(f"Search 'Ambérieu': Found {len(data['results'])} results")
    assert any(r['label'] == 'Ambérieu-en-Bugey' for r in data['results'])
    
    # Test Candidate
    response = client.get("/search/?q=Bardella")
    assert response.status_code == 200
    data = response.json()
    print(f"Search 'Bardella': Found {len(data['results'])} results")
    # Verify we have a candidate result
    candidates = [r for r in data['results'] if r['level'] == 'candidat']
    print(f"Candidates found: {len(candidates)}")
    if len(candidates) > 0:
        print(f"Sample: {candidates[0]['label']} -> {candidates[0]['code']}")
        assert len(candidates[0]['code']) == 4 # Should be circo code (Dept+Circo)

def test_elections():
    print("\n--- Testing Elections List ---")
    response = client.get("/elections/")
    assert response.status_code == 200
    data = response.json()
    print(f"Found {len(data['elections'])} elections")
    assert len(data['elections']) > 0
    
    # Check 2024 Legi T1
    e2024 = next((e for e in data['elections'] if e['year'] == 2024 and e['type'] == 'legi'), None)
    assert e2024 is not None
    print(f"2024 Legi found: {e2024['label']}")
    print(f"Available levels: {e2024['available_levels']}")
    assert 'circonscriptions' in e2024['available_levels']

def test_results_drilldown():
    print("\n--- Testing Results Drill-down ---")
    # Get ID of an election
    response = client.get("/elections/")
    e_id = response.json()['elections'][0]['id']
    
    # Test Dept Level
    res = client.get(f"/elections/{e_id}/results?level=departement")
    assert res.status_code == 200
    data = res.json()
    print(f"Dept Level: {len(data)} rows")
    assert len(data) > 80 # ~100 depts
    
    # Test Circo Level with Filter
    # 01 Ain
    res = client.get(f"/elections/{e_id}/results?level=circonscription&code_departement=01")
    assert res.status_code == 200
    data = res.json()
    print(f"Circo Level (Dept 01): {len(data)} rows")
    assert len(data) >= 5 # 5 circos in Ain

if __name__ == "__main__":
    try:
        test_search()
        test_elections()
        test_results_drilldown()
        print("\n✅ API VERIFICATION SUCCESSFUL")
    except Exception as e:
        print(f"\n❌ VERIFICATION FAILED: {str(e)}")
        exit(1)
