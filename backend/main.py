import os
import json
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import anthropic

# Load environment variables
load_dotenv()

app = FastAPI(title="MedTree Medical Correlation Engine API")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Anthropic client
anthropic_key = os.getenv("ANTHROPIC_API_KEY")
anthropic_client = None
if anthropic_key and not anthropic_key.startswith("your-"):
    anthropic_client = anthropic.Anthropic(api_key=anthropic_key)

# Fallback/Default Graph for visual demo reliability
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

class QueryRequest(BaseModel):
    query: str

class UserData(BaseModel):
    people: list = []
    conditions: list = []
    medications: list = []
    locations: list = []

class UserQueryRequest(BaseModel):
    query: str
    user_data: UserData

def build_context_from_user_data(user_data: UserData) -> str:
    """Build a natural-language graph context string from the user's medical entries."""
    lines = []
    
    # People and relationships
    for p in user_data.people:
        rel = p.get("relationship", "Unknown")
        name = p.get("name", "Unknown")
        age = p.get("age")
        age_str = f", Age {age}" if age else ""
        lines.append(f"Person: {name} (Relationship: {rel}{age_str})")
    
    # Conditions
    for c in user_data.conditions:
        lines.append(f"Condition: {c.get('person_name', '?')} HAS_CONDITION -> {c.get('condition_name', '?')} (Type: {c.get('condition_type', '?')})")
    
    # Medications
    for m in user_data.medications:
        status = m.get("status", "Active")
        lines.append(f"Medication: {m.get('person_name', '?')} {'PRESCRIBED' if status == 'Proposed' else 'TAKES'} -> {m.get('drug_name', '?')} (Status: {status})")
    
    # Locations
    for loc in user_data.locations:
        residents = loc.get("residents", [])
        res_str = ", ".join(residents) if residents else "none"
        lines.append(f"Location: {loc.get('location_name', '?')} — Residents: {res_str}")
        # Implicit LIVES_WITH relationships
        if len(residents) > 1:
            for i, r1 in enumerate(residents):
                for r2 in residents[i+1:]:
                    lines.append(f"Relationship: {r1} LIVES_WITH {r2}")
    
    # Family relationships
    self_people = [p for p in user_data.people if p.get("relationship") == "Self"]
    for p in user_data.people:
        rel = p.get("relationship", "")
        name = p.get("name", "")
        if rel == "Parent" and self_people:
            lines.append(f"Relationship: {self_people[0].get('name')} CHILD_OF {name}")
        elif rel == "Child" and self_people:
            lines.append(f"Relationship: {name} CHILD_OF {self_people[0].get('name')}")
        elif rel == "Sibling" and self_people:
            lines.append(f"Relationship: {self_people[0].get('name')} SIBLING_OF {name}")
        elif rel == "Roommate" and self_people:
            lines.append(f"Relationship: {self_people[0].get('name')} LIVES_WITH {name}")
    
    return "\n".join(lines) if lines else "No medical data provided."

def build_traversal_path_from_user_data(query: str, user_data: UserData) -> dict:
    """Determine which nodes/edges to highlight based on the query keywords."""
    query_lower = query.lower()
    to_id = lambda s: s.lower().replace(" ", "_").replace("'", "")
    # Remove non-alphanumeric chars except underscore
    import re
    to_id = lambda s: re.sub(r'[^a-z0-9_]', '', s.lower().replace(" ", "_"))
    
    all_node_ids = set()
    all_edge_ids = set()
    matched_node_ids = set()
    matched_edge_ids = set()
    
    # Build all possible IDs
    for p in user_data.people:
        all_node_ids.add(to_id(p["name"]))
    for c in user_data.conditions:
        all_node_ids.add(to_id(c["condition_name"]))
    for m in user_data.medications:
        all_node_ids.add(to_id(m["drug_name"]))
    for loc in user_data.locations:
        all_node_ids.add(to_id(loc["location_name"]))
    
    # Find which nodes are mentioned in the query
    for node_id in all_node_ids:
        # Check if any word from the node id appears in the query
        words = node_id.split("_")
        if any(w in query_lower for w in words if len(w) > 2):
            matched_node_ids.add(node_id)
    
    # If we matched a person, also include their conditions, meds, and family
    for p in user_data.people:
        pid = to_id(p["name"])
        if pid in matched_node_ids:
            # Add their conditions
            for c in user_data.conditions:
                if c.get("person_name", "").lower() == p["name"].lower():
                    cid = to_id(c["condition_name"])
                    matched_node_ids.add(cid)
                    matched_edge_ids.add(f"e_{pid}_{cid}")
            # Add their meds
            for m in user_data.medications:
                if m.get("person_name", "").lower() == p["name"].lower():
                    mid = to_id(m["drug_name"])
                    matched_node_ids.add(mid)
                    matched_edge_ids.add(f"e_{pid}_{mid}")
    
    # If we matched a medication, find who takes it and their family
    for m in user_data.medications:
        mid = to_id(m["drug_name"])
        if mid in matched_node_ids:
            person_name = m.get("person_name", "")
            pid = to_id(person_name)
            matched_node_ids.add(pid)
            matched_edge_ids.add(f"e_{pid}_{mid}")
            # Find family of this person
            self_people = [p for p in user_data.people if p.get("relationship") == "Self"]
            for p in user_data.people:
                ppid = to_id(p["name"])
                rel = p.get("relationship", "")
                if rel in ("Parent", "Child", "Sibling", "Roommate"):
                    matched_node_ids.add(ppid)
                    if self_people:
                        sid = to_id(self_people[0]["name"])
                        matched_edge_ids.add(f"e_{sid}_{ppid}")
                    # Also add their conditions
                    for c in user_data.conditions:
                        if c.get("person_name", "").lower() == p["name"].lower():
                            cid = to_id(c["condition_name"])
                            matched_node_ids.add(cid)
                            matched_edge_ids.add(f"e_{ppid}_{cid}")
    
    # If we matched a condition keyword in the query, find linked persons
    for c in user_data.conditions:
        cid = to_id(c["condition_name"])
        cwords = c["condition_name"].lower().split()
        if any(w in query_lower for w in cwords if len(w) > 2):
            matched_node_ids.add(cid)
            pid = to_id(c.get("person_name", ""))
            matched_node_ids.add(pid)
            matched_edge_ids.add(f"e_{pid}_{cid}")
    
    # Location matches
    for loc in user_data.locations:
        lid = to_id(loc["location_name"])
        lwords = loc["location_name"].lower().split()
        if any(w in query_lower for w in lwords if len(w) > 2):
            matched_node_ids.add(lid)
            for res in loc.get("residents", []):
                rid = to_id(res)
                matched_node_ids.add(rid)
                matched_edge_ids.add(f"e_{rid}_{lid}")
    
    # If nothing matched, highlight everything
    if not matched_node_ids:
        matched_node_ids = all_node_ids
    
    return {
        "nodes": list(matched_node_ids),
        "edges": list(matched_edge_ids)
    }

@app.post("/api/analyze-user")
async def analyze_user_query(request: UserQueryRequest):
    """Analyze a clinical query using the user's own medical data as graph context."""
    query = request.query
    user_data = request.user_data
    
    # 1. Build context from user data
    graph_context = build_context_from_user_data(user_data)
    
    # 2. Build traversal path
    traversal_path = build_traversal_path_from_user_data(query, user_data)
    
    # 3. Call Claude for reasoning
    warning = ""
    if anthropic_client:
        try:
            system_prompt = (
                "You are an expert clinical decision support AI assistant. "
                "You are given a patient's medical graph data including family relationships, "
                "conditions, medications, and living arrangements. "
                "Analyze the data to find hidden multi-hop medical risks. "
                "Look for: hereditary genetic risks, drug interaction dangers, "
                "environmental hazards shared between cohabitants, and autoimmune clustering patterns. "
                "Respond with a clear, concise clinical alert in Markdown format. "
                "Include: the risk found, the traversal path through relationships, "
                "and recommended actions for a doctor."
            )
            user_content = f"Clinical Query: {query}\n\nPatient Medical Graph Data:\n{graph_context}"
            
            response = anthropic_client.messages.create(
                model=os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20240620"),
                max_tokens=1200,
                system=system_prompt,
                messages=[{"role": "user", "content": user_content}]
            )
            warning = response.content[0].text
        except Exception as e:
            print(f"Anthropic API error: {e}")
            warning = f"### ⚠️ API Error\n\nCould not reach Claude 3.5. Error: {str(e)}\n\n---\n\n**Graph Context (raw):**\n```\n{graph_context}\n```"
    else:
        # Fallback: return the raw context as the warning
        warning = (
            f"### ℹ️ Graph Analysis (No LLM)\n\n"
            f"**Query:** {query}\n\n"
            f"The Anthropic API key is not configured. Below is the raw graph context "
            f"that would be sent to Claude 3.5 for medical reasoning:\n\n"
            f"```\n{graph_context}\n```\n\n"
            f"**Traversal:** {len(traversal_path['nodes'])} nodes and {len(traversal_path['edges'])} edges activated."
        )
    
    return {
        "warning": warning,
        "cognee_context": graph_context,
        "traversal_path": traversal_path,
        "scenario_description": f"User data traversal: {len(traversal_path['nodes'])} nodes, {len(traversal_path['edges'])} edges activated."
    }

@app.get("/api/graph")
async def get_graph():
    """Returns the full seeded graph structure."""
    seeded_graph_path = os.path.join(os.path.dirname(__file__), "data", "seeded_graph.json")
    if os.path.exists(seeded_graph_path):
        try:
            with open(seeded_graph_path, "r") as f:
                return json.load(f)
        except Exception:
            pass
    # Return default graph if seeded_graph doesn't exist or fails to load
    return DEFAULT_GRAPH

@app.post("/api/analyze")
async def analyze_query(request: QueryRequest):
    query = request.query.lower()
    
    # 1. Search Cognee for Context
    cognee_context = "No direct cognee graph loaded or setup. Running in standalone demo mode."
    
    try:
        import cognee
        from cognee.api.v1.search import SearchType
        # Perform query on Cognee graph
        results = await cognee.search(query_text=request.query, query_type=SearchType.GRAPH_COMPLETION)
        if results:
            cognee_context = str(results)
    except Exception as e:
        print(f"Cognee search failed/not initialized: {e}")
        # Build mock context based on query to pass to Claude
        if any(w in query for w in ["codeine", "alex", "jensen"]):
            cognee_context = "Found node: Alex Jensen (Patient). Relation: CHILD_OF -> Sarah Jensen (Patient). Node: Sarah Jensen HAS_CONDITION -> CYP2D6 Deficiency. CYP2D6 metabolizes Codeine. Mother experiences toxicity and lack of pain relief."
        elif any(w in query for w in ["joints", "lily", "chen", "arthritis"]):
            cognee_context = "Found node: Lily Chen (Patient). Relation: CHILD_OF -> David Chen (Patient). Node: David Chen HAS_HISTORY -> Psoriasis. Psoriasis clusters with Psoriatic Arthritis."
        elif any(w in query for w in ["respiratory", "marcus", "vance", "mold", "cough"]):
            cognee_context = "Found node: Marcus Vance (Patient). Relation: LIVES_WITH -> Leo Brooks (Patient). Both live at Apartment 3B. Leo Brooks has Respiratory Distress. Apartment 3B infested with Toxic Black Mold."

    # 2. Determine Traversal Path for UI Highlight
    traversal_path = {"nodes": [], "edges": []}
    
    if any(w in query for w in ["codeine", "alex", "jensen"]):
        traversal_path = {
            "nodes": ["alex_jensen", "sarah_jensen", "cyp2d6_deficiency", "codeine"],
            "edges": ["e_alex_sarah", "e_sarah_cyp2d6", "e_cyp2d6_codeine", "e_alex_codeine"]
        }
        scenario_description = "Pharmacogenomics traversal: Alex Jensen -> Sarah Jensen -> CYP2D6 Deficiency -> Codeine."
    elif any(w in query for w in ["joints", "lily", "chen", "arthritis", "stiff"]):
        traversal_path = {
            "nodes": ["lily_chen", "david_chen", "psoriasis", "psoriatic_arthritis"],
            "edges": ["e_lily_david", "e_david_psoriasis", "e_psoriasis_arthritis", "e_lily_arthritis"]
        }
        scenario_description = "Autoimmune clustering traversal: Lily Chen -> David Chen -> Psoriasis -> Psoriatic Arthritis."
    elif any(w in query for w in ["respiratory", "marcus", "vance", "mold", "cough", "leo"]):
        traversal_path = {
            "nodes": ["marcus_vance", "leo_brooks", "apartment_3b", "toxic_mold", "respiratory_distress"],
            "edges": ["e_marcus_leo", "e_marcus_apt", "e_leo_apt", "e_leo_respiratory", "e_apt_mold", "e_mold_respiratory", "e_marcus_respiratory"]
        }
        scenario_description = "Environmental overlap traversal: Marcus Vance -> Leo Brooks -> Apartment 3B -> Toxic Black Mold -> Respiratory Distress."
    else:
        # Default or fallback traversal
        traversal_path = {"nodes": [], "edges": []}
        scenario_description = "General search: No specific multi-hop scenario triggered."

    # 3. Call Claude 3.5 for Medical Reasoning
    warning = ""
    
    if anthropic_client:
        try:
            system_prompt = (
                "You are an expert clinical decision support AI assistant. "
                "Analyze the provided graph retrieval context and explain the hidden medical risk "
                "and recommended actions clearly in Markdown format. Keep your response concise, "
                "focused, and professional for an emergency room doctor."
            )
            user_content = f"User Request: {request.query}\n\nCognee Graph Context:\n{cognee_context}"
            
            response = anthropic_client.messages.create(
                model=os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20240620"),
                max_tokens=1000,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": user_content}
                ]
            )
            # Response is in text
            warning = response.content[0].text
        except Exception as e:
            print(f"Anthropic API call failed: {e}")
            warning = f"### [Error invoking Claude 3.5 API]\n\n{get_mock_warning(query)}"
    else:
        # Mock responses matching the scenarios for fallback/no-key presentations
        warning = get_mock_warning(query)

    return {
        "warning": warning,
        "cognee_context": cognee_context,
        "traversal_path": traversal_path,
        "scenario_description": scenario_description
    }

def get_mock_warning(query: str) -> str:
    """Returns realistic mock medical alerts for the demo scenarios if Anthropic API is not available."""
    if any(w in query for w in ["codeine", "alex", "jensen"]):
        return (
            "### ⚠️ CRITICAL ALERT: Hereditary Pharmacogenomic Risk\n\n"
            "**Patient:** Alex Jensen\n"
            "**Medication Requested:** Codeine\n\n"
            "#### Analysis:\n"
            "- **Hereditary Link:** Patient is the biological child of **Sarah Jensen**.\n"
            "- **Genetic Marker:** Sarah Jensen has a documented **CYP2D6 Poor Metabolizer** genotype.\n"
            "- **Pharmacology:** Codeine is a prodrug requiring active CYP2D6 enzymes to metabolize into its active analgesic form (morphine). "
            "Due to maternal deficiency, there is an extremely high probability (>50%) that Alex Jensen has inherited this poor metabolizer phenotype.\n\n"
            "#### Clinical Risks:\n"
            "1. **Therapeutic Failure:** Codeine will provide little to no pain relief.\n"
            "2. **Alternative Pathway Toxicity:** Risk of accumulation of unmetabolized codeine leading to unexpected side effects.\n\n"
            "#### Recommended Actions:\n"
            "- **AVOID** Codeine or other prodrug opioids (e.g., Tramadol).\n"
            "- **Alternative Analgesic:** Prescribe non-prodrug pain management options like **Morphine** or **Hydromorphone** at standard pediatric dosages, or non-opioids if appropriate."
        )
    elif any(w in query for w in ["joints", "lily", "chen", "arthritis", "stiff"]):
        return (
            "### ⚠️ ALERT: Hereditary Autoimmune Risk\n\n"
            "**Patient:** Lily Chen\n"
            "**Symptom Reported:** Stiff Joints / Joint Pain\n\n"
            "#### Analysis:\n"
            "- **Hereditary Link:** Patient is the biological child of **David Chen**.\n"
            "- **Family History:** David Chen has a chronic history of severe **Psoriasis**.\n"
            "- **Clinical Correlation:** Psoriasis and Psoriatic Arthritis are highly correlated autoimmune clusters. Psoriatic arthritis is present in up to 30% of patients with psoriasis, and hereditary risk factors significantly increase early onset in direct offspring presenting with joint symptoms.\n\n"
            "#### Clinical Risks:\n"
            "1. **Psoriatic Arthritis (PsA) Early Development:** Highly probable cause of the joint stiffness, even in the absence of active skin lesions.\n"
            "2. **Joint Damage Progression:** Delayed diagnosis can lead to irreversible joint erosion.\n\n"
            "#### Recommended Actions:\n"
            "- **Urgent Rheumatology Referral:** Order evaluation for Psoriatic Arthritis.\n"
            "- **Diagnostic Screening:** Order HLA-B27 genetic testing, Rheumatoid Factor (to rule out RA), and baseline joint X-rays/ultrasound.\n"
            "- **Symptom Management:** Initiate NSAIDs under supervision while diagnostic workup is completed."
        )
    elif any(w in query for w in ["respiratory", "marcus", "vance", "mold", "cough", "leo"]):
        return (
            "### ⚠️ DANGER ALERT: Environmental Overlap Detected\n\n"
            "**Patient:** Marcus Vance\n"
            "**Symptom Reported:** Respiratory Distress / Cough\n\n"
            "#### Analysis:\n"
            "- **Proximity Link:** Marcus Vance lives with **Leo Brooks** at **Apartment 3B**.\n"
            "- **Shared Environment History:** Leo Brooks was treated recently for **Severe Respiratory Distress** and coughing.\n"
            "- **Environmental Hazard:** Apartment 3B has a documented infestation of **Toxic Black Mold (Stachybotrys chartarum)** in the heating/ventilation system.\n\n"
            "#### Clinical Risks:\n"
            "1. **Mycotoxicosis:** Marcus's respiratory distress is highly likely an acute reaction to airborne Stachybotrys mycotoxins rather than an infectious disease.\n"
            "2. **Chronic Pulmonary Complications:** Risk of severe alveolar inflammation if exposure continues.\n\n"
            "#### Recommended Actions:\n"
            "- **Immediate Evacuation:** Instruct patient to immediately vacate **Apartment 3B** and avoid returning until certified remediation is completed.\n"
            "- **Therapy:** Administer bronchodilators and consider a short course of corticosteroids if wheezing or airway inflammation is severe.\n"
            "- **Public Health Notification:** Recommend landlord be notified for professional mold remediation."
        )
    else:
        return (
            "### ℹ️ Analysis Complete\n\n"
            "Query processed. No critical multi-hop medical risk clusters detected in the immediate graph. "
            "Please check spelling or enter a specific patient trigger (e.g., 'Alex Jensen Codeine', 'Lily Chen stiff joints', or 'Marcus Vance respiratory distress')."
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
