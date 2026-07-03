import os
import json
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import anthropic
try:
    from google import genai
except ImportError:
    genai = None

# Load environment variables
load_dotenv()

# If OpenAI keys are placeholder/missing but Gemini key exists, swap Cognee to Gemini provider.
# This MUST happen before importing cognee, since cognee reads env vars at import time.
openai_key = os.getenv("LLM_API_KEY", "")
gemini_key = os.getenv("GEMINI_API_KEY", "")

if (not openai_key or openai_key.startswith("your-")) and gemini_key and not gemini_key.startswith("your-"):
    os.environ["LLM_PROVIDER"] = "gemini"
    os.environ["LLM_MODEL"] = "gemini/gemini-2.0-flash-lite"
    os.environ["LLM_API_KEY"] = gemini_key
    os.environ["EMBEDDING_PROVIDER"] = "gemini"
    os.environ["EMBEDDING_MODEL"] = "gemini/gemini-2.0-flash-lite"
    os.environ["EMBEDDING_API_KEY"] = gemini_key
    print("[INFO] OpenAI key not found. Switched Cognee to Google Gemini provider in main.py.")

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

# Initialize Google Gemini client (fallback when Anthropic is unavailable)
gemini_key = os.getenv("GEMINI_API_KEY")
gemini_client = None
if genai and gemini_key and not gemini_key.startswith("your-"):
    try:
        gemini_client = genai.Client(api_key=gemini_key)
    except Exception as e:
        print(f"Failed to initialize Gemini client: {e}")

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

class Profile(BaseModel):
    id: str
    full_name: str
    age: int | None = None

class MedicalRecord(BaseModel):
    id: str
    user_id: str
    record_type: str
    name: str
    metadata: dict = {}

class Relationship(BaseModel):
    id: str
    requester_id: str
    receiver_id: str
    relationship_type: str
    status: str

class UserData(BaseModel):
    profiles: list[Profile] = []
    medical_records: list[MedicalRecord] = []
    relationships: list[Relationship] = []

class UserQueryRequest(BaseModel):
    query: str
    user_id: str
    user_data: UserData

class BuildGraphRequest(BaseModel):
    user_id: str
    user_data: UserData

def build_context_from_user_data(query_request: UserQueryRequest) -> str:
    """Build a natural-language graph context string from the user's multi-account database records."""
    user_id = query_request.user_id
    user_data = query_request.user_data
    
    # Map profiles by ID
    profiles_map = {p.id: p for p in user_data.profiles}
    current_user = profiles_map.get(user_id)
    
    if not current_user:
        return "Requester profile not found."
        
    # BFS to find all reachable profiles from current user
    reachable_users = {user_id}
    queue = [user_id]
    
    while len(queue) > 0:
        current_id = queue.pop(0)
        for rel in user_data.relationships:
            if rel.status == 'active':
                if rel.requester_id == current_id and rel.receiver_id in profiles_map and rel.receiver_id not in reachable_users:
                    reachable_users.add(rel.receiver_id)
                    queue.append(rel.receiver_id)
                elif rel.receiver_id == current_id and rel.requester_id in profiles_map and rel.requester_id not in reachable_users:
                    reachable_users.add(rel.requester_id)
                    queue.append(rel.requester_id)

    lines = []
    
    # 1. Output reachable people and their medical records
    for p_id in reachable_users:
        p = profiles_map.get(p_id)
        if not p:
            continue
        role = "Self" if p_id == user_id else "Relative/Connection"
        age_str = f", Age: {p.age}" if p.age else ""
        lines.append(f"Person: {p.full_name} (Role: {role}{age_str})")
        
        # Medical records for this person
        p_records = [r for r in user_data.medical_records if r.user_id == p_id]
        for r in p_records:
            if r.record_type == 'condition':
                lines.append(f"Condition: {p.full_name} HAS_CONDITION -> {r.name} (Type: {r.metadata.get('condition_type', 'Chronic')})")
            elif r.record_type == 'medication':
                status = r.metadata.get('status', 'Active')
                lines.append(f"Medication: {p.full_name} {'PRESCRIBED' if status == 'Proposed' else 'TAKES'} -> {r.name} (Status: {status})")

    # 2. Output active relationships between reachable profiles
    processed_rels = set()
    for rel in user_data.relationships:
        if rel.status == 'active' and rel.requester_id in reachable_users and rel.receiver_id in reachable_users:
            req = profiles_map.get(rel.requester_id)
            rec = profiles_map.get(rel.receiver_id)
            if req and rec:
                rel_key = tuple(sorted([rel.requester_id, rel.receiver_id]))
                if rel_key not in processed_rels:
                    processed_rels.add(rel_key)
                    rel_type = rel.relationship_type
                    if rel_type == 'Parent-Child':
                        if (req.age or 0) < (rec.age or 0):
                            lines.append(f"Relationship: {req.full_name} CHILD_OF {rec.full_name}")
                        else:
                            lines.append(f"Relationship: {rec.full_name} CHILD_OF {req.full_name}")
                    elif rel_type == 'Roommate':
                        lines.append(f"Relationship: {req.full_name} LIVES_WITH {rec.full_name}")
                    elif rel_type == 'Sibling-Sibling':
                        lines.append(f"Relationship: {req.full_name} SIBLING_OF {rec.full_name}")
                    elif rel_type == 'Spouse':
                        lines.append(f"Relationship: {req.full_name} SPOUSE_OF {rec.full_name}")
                        
    return "\n".join(lines) if lines else "No medical data provided."

def build_traversal_path_from_user_data(query_request: UserQueryRequest) -> dict:
    """Determine which nodes and edges to highlight in the dynamic graph based on query terms."""
    query_lower = query_request.query.lower()
    user_id = query_request.user_id
    user_data = query_request.user_data
    
    import re
    to_id = lambda s: re.sub(r'[^a-z0-9_]', '', s.lower().replace(" ", "_"))
    
    profiles_map = {p.id: p for p in user_data.profiles}
    
    # 1. Build adjacency graph representation
    from collections import defaultdict
    graph = defaultdict(list)
    edge_map = {} # Maps (node_a, node_b) -> edge_id
    
    # Add active relationships
    for rel in user_data.relationships:
        if rel.status == 'active':
            u1 = rel.requester_id
            u2 = rel.receiver_id
            if u1 in profiles_map and u2 in profiles_map:
                graph[u1].append(u2)
                graph[u2].append(u1)
                sorted_ids = sorted([u1, u2])
                edge_id = f"e_{sorted_ids[0]}_{sorted_ids[1]}"
                edge_map[(u1, u2)] = edge_id
                edge_map[(u2, u1)] = edge_id
                
    # Add medical record connections
    for r in user_data.medical_records:
        pid = r.user_id
        rec_id = to_id(r.name)
        if pid in profiles_map:
            graph[pid].append(rec_id)
            graph[rec_id].append(pid)
            edge_id = f"e_{pid}_{rec_id}"
            edge_map[(pid, rec_id)] = edge_id
            edge_map[(rec_id, pid)] = edge_id

    # 2. Find matched target nodes in query
    matched_node_targets = set()
    
    # Match user profile names
    for pid, prof in profiles_map.items():
        name_words = prof.full_name.lower().split()
        if any(w in query_lower for w in name_words if len(w) > 2):
            matched_node_targets.add(pid)
            
    # Match medical records by name or trigger keywords
    for r in user_data.medical_records:
        rec_id = to_id(r.name)
        rec_name_lower = r.name.lower()
        
        # Simple name match
        words = rec_name_lower.split()
        if any(w in query_lower for w in words if len(w) > 2) or rec_name_lower in query_lower:
            matched_node_targets.add(rec_id)
            continue
            
        # Clinical synonyms and trigger words mapping
        triggers = []
        if "malignant hyperthermia" in rec_name_lower:
            triggers = ["sevoflurane", "succinylcholine", "anesthetic", "anesthesia", "surgery", "operation", "ryr1", "genetic", "hereditary", "inherited", "history", "risk"]
        elif "cyp2d6" in rec_name_lower:
            triggers = ["codeine", "prodrug", "tramadol", "metabolizer", "genetic", "hereditary", "inherited", "history", "risk"]
        elif "psoriasis" in rec_name_lower or "arthritis" in rec_name_lower:
            triggers = ["joints", "stiff", "rheumatology", "psoriatic", "genetic", "hereditary", "inherited", "history", "risk"]
        elif "mold" in rec_name_lower or "tuberculosis" in rec_name_lower or "tb" in rec_name_lower:
            triggers = ["cough", "respiratory", "breathing", "lung", "apartment", "apartment_3b", "apartment_2b"]
            
        if any(t in query_lower for t in triggers):
            matched_node_targets.add(rec_id)

    # 3. BFS to find path from user_id to all matched targets
    highlighted_nodes = set()
    highlighted_edges = set()
    
    if user_id in graph:
        queue = [user_id]
        visited = {user_id: None} # node -> parent node
        
        head = 0
        while head < len(queue):
            curr = queue[head]
            head += 1
            for neighbor in graph[curr]:
                if neighbor not in visited:
                    visited[neighbor] = curr
                    queue.append(neighbor)
                    
        # Trace paths back from each matched target
        for target in matched_node_targets:
            if target in visited:
                curr = target
                while curr is not None:
                    highlighted_nodes.add(curr)
                    parent = visited[curr]
                    if parent is not None:
                        edge_id = edge_map.get((parent, curr))
                        if edge_id:
                            highlighted_edges.add(edge_id)
                    curr = parent

    # Fallback: if nothing matched/highlighted, default to highlighting all reachable nodes & edges
    if not highlighted_nodes:
        # If user_id is in graph, we can highlight the connected component
        if user_id in graph:
            queue = [user_id]
            visited = {user_id}
            head = 0
            while head < len(queue):
                curr = queue[head]
                head += 1
                highlighted_nodes.add(curr)
                for neighbor in graph[curr]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
                    edge_id = edge_map.get((curr, neighbor))
                    if edge_id:
                        highlighted_edges.add(edge_id)
        else:
            # Absolute fallback: all nodes and edges in the system
            for node in graph:
                highlighted_nodes.add(node)
            for edge_id in edge_map.values():
                highlighted_edges.add(edge_id)
            
    return {
        "nodes": list(highlighted_nodes),
        "edges": list(highlighted_edges)
    }



# Shared system prompt for clinical reasoning (used by both Claude and Gemini)
CLINICAL_SYSTEM_PROMPT = (
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

@app.post("/api/analyze-user")
async def analyze_user_query(request: UserQueryRequest):
    """Analyze a clinical query using the user's own medical data as graph context."""
    query = request.query
    user_data = request.user_data
    
    # 1. Build context from user data
    graph_context = build_context_from_user_data(request)
    
    # --- COGNEE LIVE SEARCH ---
    cognee_context = graph_context
    try:
        import cognee
        from cognee.api.v1.search import SearchType
        dataset_name = f"user_{request.user_id}"
        print(f"Searching Cognee dataset: {dataset_name}")
        results = await cognee.search(query_text=query, query_type=SearchType.GRAPH_COMPLETION)
        
        if results:
            cognee_context = str(results)
    except Exception as e:
        print(f"Cognee search failed: {e}")
        cognee_context = graph_context
    # --------------------------
    
    # 2. Build traversal path
    traversal_path = build_traversal_path_from_user_data(request)
    
    # 3. Call LLM for reasoning (Claude → Gemini → Mock fallback)
    warning = ""
    user_content = f"Clinical Query: {query}\n\nPatient Medical Graph Data (via Cognee):\n{cognee_context}"
    
    if anthropic_client:
        try:
            response = anthropic_client.messages.create(
                model=os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20240620"),
                max_tokens=1200,
                system=CLINICAL_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_content}]
            )
            warning = response.content[0].text
        except Exception as e:
            print(f"Anthropic API error: {e}")
            warning = f"### ⚠️ API Error\n\nCould not reach Claude 3.5. Error: {str(e)}\n\n---\n\n**Graph Context (via Cognee):**\n```\n{cognee_context}\n```"
    elif gemini_client:
        try:
            response = gemini_client.models.generate_content(
                model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
                contents=f"{CLINICAL_SYSTEM_PROMPT}\n\n{user_content}"
            )
            warning = response.text
        except Exception as e:
            print(f"Gemini API error: {e}")
            warning = f"### ⚠️ API Error\n\nCould not reach Gemini. Error: {str(e)}\n\n---\n\n**Graph Context (via Cognee):**\n```\n{cognee_context}\n```"
    else:
        # Fallback: return the raw context as the warning
        warning = (
            f"### ℹ️ Graph Analysis (No LLM)\n\n"
            f"**Query:** {query}\n\n"
            f"No LLM API key is configured (Anthropic or Gemini). Below is the raw graph context:\n\n"
            f"```\n{cognee_context}\n```\n\n"
            f"**Traversal:** {len(traversal_path['nodes'])} nodes and {len(traversal_path['edges'])} edges activated."
        )
    
    return {
        "warning": warning,
        "cognee_context": cognee_context,
        "traversal_path": traversal_path,
        "scenario_description": f"User data traversal: {len(traversal_path['nodes'])} nodes, {len(traversal_path['edges'])} edges activated."
    }

@app.post("/api/build-graph")
async def build_graph(request: BuildGraphRequest):
    """Build the Cognee semantic graph for a user by pruning first, then adding and cognifying."""
    try:
        import cognee
        from cognee.infrastructure.databases.graph import get_graph_engine
        
        # 1. Build text context from user data
        dummy_query_request = UserQueryRequest(query="", user_id=request.user_id, user_data=request.user_data)
        graph_context = build_context_from_user_data(dummy_query_request)
        
        dataset_name = f"user_{request.user_id}"
        print(f"Pruning existing Cognee graphs for safety...")
        await cognee.prune.prune_system()
        
        print(f"Adding new data to dataset: {dataset_name}")
        await cognee.add(data=graph_context, dataset_name=dataset_name)
        
        print("Cognifying graph...")
        await cognee.cognify()
        
        # Fetch the visual graph nodes & edges directly from Cognee
        print("Retrieving visual graph data...")
        graph_engine = await get_graph_engine()
        raw_graph_data = await graph_engine.get_graph_data()
        nodes, edges = raw_graph_data
        
        return {
            "success": True,
            "nodes": nodes or [],
            "edges": edges or []
        }
    except Exception as e:
        print(f"Failed to build Cognee graph: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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

    # 3. Call LLM for Medical Reasoning (Claude → Gemini → Mock fallback)
    warning = ""
    demo_system_prompt = (
        "You are an expert clinical decision support AI assistant. "
        "Analyze the provided graph retrieval context and explain the hidden medical risk "
        "and recommended actions clearly in Markdown format. Keep your response concise, "
        "focused, and professional for an emergency room doctor."
    )
    user_content = f"User Request: {request.query}\n\nCognee Graph Context:\n{cognee_context}"
    
    if anthropic_client:
        try:
            response = anthropic_client.messages.create(
                model=os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20240620"),
                max_tokens=1000,
                system=demo_system_prompt,
                messages=[
                    {"role": "user", "content": user_content}
                ]
            )
            # Response is in text
            warning = response.content[0].text
        except Exception as e:
            print(f"Anthropic API call failed: {e}")
            warning = f"### [Error invoking Claude 3.5 API]\n\n{get_mock_warning(query)}"
    elif gemini_client:
        try:
            response = gemini_client.models.generate_content(
                model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
                contents=f"{demo_system_prompt}\n\n{user_content}"
            )
            warning = response.text
        except Exception as e:
            print(f"Gemini API call failed: {e}")
            warning = f"### [Error invoking Gemini API]\n\n{get_mock_warning(query)}"
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
