import asyncio
import json
import os
import sys
from dotenv import load_dotenv

# Ensure we can import cognee and related modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load env before importing cognee
load_dotenv()

import cognee
from cognee.infrastructure.databases.graph import get_graph_engine

# Fallback visual graph dataset for visual demo safety
DEFAULT_GRAPH = {
    "nodes": [
        # Pharmacogenomics
        {"id": "alex_jensen", "label": "Alex Jensen", "type": "Patient", "group": "pharmacogenomics"},
        {"id": "sarah_jensen", "label": "Sarah Jensen", "type": "Patient", "group": "pharmacogenomics"},
        {"id": "cyp2d6_deficiency", "label": "CYP2D6 Deficiency", "type": "GeneticCondition", "group": "pharmacogenomics"},
        {"id": "codeine", "label": "Codeine", "type": "Medication", "group": "pharmacogenomics"},
        
        # Autoimmune
        {"id": "lily_chen", "label": "Lily Chen", "type": "Patient", "group": "autoimmune"},
        {"id": "david_chen", "label": "David Chen", "type": "Patient", "group": "autoimmune"},
        {"id": "psoriasis", "label": "Psoriasis", "type": "AutoimmuneCondition", "group": "autoimmune"},
        {"id": "psoriatic_arthritis", "label": "Psoriatic Arthritis", "type": "Risk", "group": "autoimmune"},
        
        # Environmental
        {"id": "marcus_vance", "label": "Marcus Vance", "type": "Patient", "group": "environmental"},
        {"id": "leo_brooks", "label": "Leo Brooks", "type": "Patient", "group": "environmental"},
        {"id": "apartment_3b", "label": "Apartment 3B", "type": "Location", "group": "environmental"},
        {"id": "toxic_mold", "label": "Toxic Black Mold", "type": "EnvironmentalFactor", "group": "environmental"},
        {"id": "respiratory_distress", "label": "Respiratory Distress", "type": "Symptom", "group": "environmental"}
    ],
    "edges": [
        # Pharmacogenomics
        {"id": "e_alex_sarah", "source": "alex_jensen", "target": "sarah_jensen", "label": "CHILD_OF", "group": "pharmacogenomics"},
        {"id": "e_sarah_cyp2d6", "source": "sarah_jensen", "target": "cyp2d6_deficiency", "label": "HAS_CONDITION", "group": "pharmacogenomics"},
        {"id": "e_cyp2d6_codeine", "source": "cyp2d6_deficiency", "target": "codeine", "label": "AFFECTS_METABOLISM", "group": "pharmacogenomics"},
        {"id": "e_alex_codeine", "source": "alex_jensen", "target": "codeine", "label": "PRESCRIBED", "group": "pharmacogenomics"},
        
        # Autoimmune
        {"id": "e_lily_david", "source": "lily_chen", "target": "david_chen", "label": "CHILD_OF", "group": "autoimmune"},
        {"id": "e_david_psoriasis", "source": "david_chen", "target": "psoriasis", "label": "HAS_HISTORY", "group": "autoimmune"},
        {"id": "e_psoriasis_arthritis", "source": "psoriasis", "target": "psoriatic_arthritis", "label": "CLUSTERS_WITH", "group": "autoimmune"},
        {"id": "e_lily_arthritis", "source": "lily_chen", "target": "psoriatic_arthritis", "label": "SUSPECTED_RISK", "group": "autoimmune"},
        
        # Environmental
        {"id": "e_marcus_leo", "source": "marcus_vance", "target": "leo_brooks", "label": "LIVES_WITH", "group": "environmental"},
        {"id": "e_marcus_apt", "source": "marcus_vance", "target": "apartment_3b", "label": "LIVES_AT", "group": "environmental"},
        {"id": "e_leo_apt", "source": "leo_brooks", "target": "apartment_3b", "label": "LIVES_AT", "group": "environmental"},
        {"id": "e_leo_respiratory", "source": "leo_brooks", "target": "respiratory_distress", "label": "HAS_SYMPTOM", "group": "environmental"},
        {"id": "e_apt_mold", "source": "apartment_3b", "target": "toxic_mold", "label": "INFESTED_WITH", "group": "environmental"},
        {"id": "e_mold_respiratory", "source": "toxic_mold", "target": "respiratory_distress", "label": "CAUSES", "group": "environmental"},
        {"id": "e_marcus_respiratory", "source": "marcus_vance", "target": "respiratory_distress", "label": "DEVELOPED_SYMPTOM", "group": "environmental"}
    ]
}

async def seed_data():
    mock_data_path = os.path.join(os.path.dirname(__file__), "data", "mock_data.json")
    if not os.path.exists(mock_data_path):
        print(f"Error: Mock data not found at {mock_data_path}")
        return

    with open(mock_data_path, "r") as f:
        mock_data = json.load(f)

    output_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "seeded_graph.json")

    try:
        # Ingest the descriptions of each scenario into Cognee
        print("Ingesting mock scenarios into Cognee...")
        for scenario in mock_data["scenarios"]:
            print(f"Adding: {scenario['title']}")
            await cognee.add(
                data=scenario["description"],
                dataset_name="medtree_scenarios"
            )

        print("\nRunning Cognee cognify pipeline (constructing graph)...")
        await cognee.cognify()

        print("\nGraph constructed successfully! Retrieving graph data...")
        graph_engine = await get_graph_engine()
        graph_data = await graph_engine.get_graph_data()
        
        # Normalize graph_data to JSON format
        # If graph_data is empty or not in standard form, fallback to DEFAULT_GRAPH
        if not graph_data or not graph_data.get("nodes"):
            print("Cognee returned empty graph, using DEFAULT_GRAPH mapping for UI visual structure.")
            graph_data = DEFAULT_GRAPH
            
        with open(output_path, "w") as f:
            json.dump(graph_data, f, indent=2, default=str)
            
        print(f"\n[SUCCESS] Cognee graph data saved to {output_path}")

    except Exception as e:
        print(f"\n[WARNING] Could not execute Cognee pipelines: {e}")
        print("This is expected if your LLM_API_KEY is not set or valid.")
        print("Writing default structured mock graph to allow UI demo presentation...")
        
        # Save default graph structure so frontend still loads beautifully
        with open(output_path, "w") as f:
            json.dump(DEFAULT_GRAPH, f, indent=2)
            
        print(f"[SUCCESS] Standalone mock graph structure saved to {output_path}")

if __name__ == "__main__":
    asyncio.run(seed_data())
