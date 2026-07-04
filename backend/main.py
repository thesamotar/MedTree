import os
import re
import json
import asyncio
from collections import defaultdict
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
async_anthropic_client = None
if anthropic_key and not anthropic_key.startswith("your-"):
    anthropic_client = anthropic.Anthropic(api_key=anthropic_key)
    async_anthropic_client = anthropic.AsyncAnthropic(api_key=anthropic_key)

# Initialize Google Gemini client (fallback when Anthropic is unavailable)
# Re-use gemini_key already read at module top (line 20)
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
    semantic_facts: list[str] = []

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
                        
    # 3. Output semantic facts
    if user_data.semantic_facts:
        lines.append("\nUnstructured Clinical Notes Memory:")
        for fact in user_data.semantic_facts:
            lines.append(f"Fact: {fact}")
                        
    return "\n".join(lines) if lines else "No medical data provided."

# Matches the structured cross-account family-history facts written by the note-approval
# flow, e.g. "Mamata Patra has Genetic condition: RYR1 Mutation". Groups:
# 1=subject name, 2=condition_type (optional), 3=record_type, 4=condition/medication name.
FAMILY_FACT_RE = re.compile(
    r'^(.+?) has (?:(Genetic|Autoimmune|Chronic|Symptom|Allergy) )?(condition|medication): (.+)$',
    re.IGNORECASE,
)


def _record_query_matches(rec_name_lower: str, query_lower: str) -> bool:
    """Whether a condition/medication name is implicated by the query, via direct name
    match or clinical trigger keywords. Shared by own records and family-history records."""
    words = rec_name_lower.split()
    if any(w in query_lower for w in words if len(w) > 2) or (rec_name_lower and rec_name_lower in query_lower):
        return True

    triggers = []
    if "malignant hyperthermia" in rec_name_lower or "ryr1" in rec_name_lower or "hyperthermic" in rec_name_lower:
        # Any volatile/triggering anesthetic agent, so "is desflurane safe" surfaces the link.
        triggers = ["sevoflurane", "desflurane", "isoflurane", "halothane", "enflurane",
                    "succinylcholine", "suxamethonium", "volatile", "anesthetic", "anaesthetic",
                    "anesthesia", "anaesthesia", "surgery", "operation", "ryr1", "genetic",
                    "hereditary", "inherited", "history", "risk"]
    elif "cyp2d6" in rec_name_lower:
        triggers = ["codeine", "prodrug", "tramadol", "metabolizer", "genetic", "hereditary", "inherited", "history", "risk"]
    elif "psoriasis" in rec_name_lower or "arthritis" in rec_name_lower:
        triggers = ["joints", "stiff", "rheumatology", "psoriatic", "genetic", "hereditary", "inherited", "history", "risk"]
    elif "mold" in rec_name_lower or "tuberculosis" in rec_name_lower or "tb" in rec_name_lower:
        triggers = ["cough", "respiratory", "breathing", "lung", "apartment", "apartment_3b", "apartment_2b"]

    return any(t in query_lower for t in triggers)


def build_traversal_path_from_user_data(query_request: UserQueryRequest) -> dict:
    """Determine which nodes and edges to highlight in the dynamic graph based on query terms."""
    query_lower = query_request.query.lower()
    user_id = query_request.user_id
    user_data = query_request.user_data
    
    # Must exactly match the frontend toId() in page.js: lowercase, then replace every
    # non-alphanumeric char with '_'. A divergent slug here (e.g. dropping punctuation)
    # produces highlight IDs that don't match the rendered graph → orphan/missing nodes.
    to_id = lambda s: re.sub(r'[^a-z0-9]', '_', (s or '').lower())
    
    profiles_map = {p.id: p for p in user_data.profiles}
    
    # 1. Build adjacency graph representation
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

    # Add family-history conditions parsed from cross-account semantic facts.
    # A relative's conditions can't be stored in their own medical_records (RLS), so the
    # approval flow saves them as structured text like "Mamata Patra has Genetic condition:
    # RYR1 Mutation". Parse those and wire them into the graph as virtual condition nodes
    # attached to the real relative (or a virtual person if the relative has no profile),
    # so a query can traverse patient -> relative -> condition. Kept in sync with the
    # frontend parser in buildGraphFromEntries (page.js).
    name_to_pid = {p.full_name.lower(): pid for pid, p in profiles_map.items() if p.full_name}
    family_records = []  # (condition_node_id, condition_name_lower) for query matching below
    for fact in (user_data.semantic_facts or []):
        m = FAMILY_FACT_RE.match((fact or "").strip())
        if not m:
            continue
        subject_name = m.group(1).strip()
        rec_name = m.group(4).strip()

        # Resolve subject: exact name -> first-name/partial -> virtual person node.
        subj = name_to_pid.get(subject_name.lower())
        if subj is None:
            for pid, p in profiles_map.items():
                pn = (p.full_name or "").lower()
                if pn and (pn.startswith(subject_name.lower()) or subject_name.lower().startswith(pn.split(" ")[0])):
                    subj = pid
                    break
        if subj is None:
            subj = "fam_" + to_id(subject_name)
            graph[user_id].append(subj)
            graph[subj].append(user_id)
            eid = f"e_{user_id}_{subj}"
            edge_map[(user_id, subj)] = eid
            edge_map[(subj, user_id)] = eid

        cond_id = to_id(rec_name)
        graph[subj].append(cond_id)
        graph[cond_id].append(subj)
        eid = f"e_{subj}_{cond_id}"
        edge_map[(subj, cond_id)] = eid
        edge_map[(cond_id, subj)] = eid
        family_records.append((cond_id, rec_name.lower()))

    # 2. Find matched target nodes in query
    matched_node_targets = set()
    
    # Match user profile names
    for pid, prof in profiles_map.items():
        name_words = prof.full_name.lower().split()
        if any(w in query_lower for w in name_words if len(w) > 2):
            matched_node_targets.add(pid)
            
    # Match medical records by name or trigger keywords
    for r in user_data.medical_records:
        if _record_query_matches(r.name.lower(), query_lower):
            matched_node_targets.add(to_id(r.name))

    # Match family-history conditions the same way, so an MH/anesthetic query pulls in the
    # relative that carries RYR1 / a prior MH reaction (and, transitively, the path to them).
    for cond_id, cond_name_lower in family_records:
        if _record_query_matches(cond_name_lower, query_lower):
            matched_node_targets.add(cond_id)

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
    "You are a clinical decision-support assistant. Explain your findings in clear, plain "
    "language that a busy clinician — or an informed patient — can understand at a glance. "
    "You are given a patient's connected medical picture: their family relationships, "
    "conditions, medications, and any shared living arrangements.\n\n"
    "Find the single most important hidden or multi-step risk (an inherited/genetic risk, a "
    "dangerous drug interaction, a shared environmental hazard, or a cluster of related "
    "conditions) and explain it simply.\n\n"
    "Reply in Markdown using these short sections and nothing else:\n"
    "### Bottom line\n"
    "One or two plain-English sentences: what the key risk is and what to do about it.\n\n"
    "### Risk pathway\n"
    "Show HOW the risk reaches the patient, step by step, so a clinician can follow the chain of "
    "reasoning across the family. Use a numbered list where each step is a complete, plain-English "
    "sentence that names the person, how they are related to the patient, and the relevant clinical "
    "finding. For example:\n"
    "1. The patient's grandmother had a severe, life-threatening reaction under general anaesthesia.\n"
    "2. The patient's mother was confirmed to carry the RYR1 gene change (which causes that reaction).\n"
    "3. Because this trait is inherited (autosomal dominant), the patient has about a 50% chance of "
    "carrying it too.\n"
    "4. The drugs planned for surgery (sevoflurane, succinylcholine) are known triggers of that "
    "reaction.\n"
    "Keep every step a real sentence — do NOT use arrow-only diagrams, code blocks, or database IDs.\n\n"
    "### Recommended next steps\n"
    "A short Markdown table with columns 'Action', 'Urgency', 'Why'. In the Urgency column use "
    "exactly one of: CRITICAL, URGENT, MEDIUM, LOW.\n\n"
    "Rules: Keep it concise. The FIRST time you use a medical term or abbreviation, add a brief "
    "plain-language explanation in parentheses (e.g. 'malignant hyperthermia (a life-threatening "
    "reaction to certain anaesthetic drugs)'). Be direct about severity but not alarmist. Base your "
    "answer only on the information provided; if it is insufficient, say so instead of inventing "
    "details."
)


def _extract_cognee_context(results) -> str:
    """Pull the human-readable text out of Cognee search results and strip internal markers
    (content delimiters, index-field tags, node/connection headers) so the clinical LLM is
    given clean facts rather than raw database tokens."""
    items = results if isinstance(results, list) else [results]
    parts = []
    for r in items:
        if isinstance(r, dict):
            parts.append(str(r.get("search_result") or r.get("context") or r.get("text") or ""))
        else:
            parts.append(str(r))
    text = "\n".join(p for p in parts if p and p.strip())
    # Remove Cognee's internal formatting markers.
    text = text.replace("__node_content_start__", "").replace("__node_content_end__", "")
    text = re.sub(r'^\s*(Nodes|Connections|Node|Edge):\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'\s*\[[a-z0-9_,\s]+\]\s*$', '', text, flags=re.MULTILINE)  # trailing index tags
    text = re.sub(r'\n{3,}', '\n\n', text).strip()
    return text

@app.post("/api/analyze-user")
async def analyze_user_query(request: UserQueryRequest):
    """Analyze a clinical query using the user's own medical data as graph context."""
    query = request.query
    
    # 1. BFS context from the live payload — kept only as a resilient fallback.
    graph_context = build_context_from_user_data(request)

    # --- COGNEE GRAPH RETRIEVAL (primary) ---
    # Route the query genuinely through Cognee's knowledge-graph memory, scoped to THIS
    # user's dataset (via datasets=/user=, the same scoping /build-graph relies on).
    # only_context=True returns the graph-derived context Cognee retrieves for the query —
    # the relevant entities/relationships it linked across every ingested note, including
    # semantic bridges (e.g. RYR1 -> malignant hyperthermia -> triggering agents) that no
    # keyword/BFS pass would find. We then hand that context to the clinical LLM. We fall
    # back to the BFS context only if Cognee has nothing (graph not built yet) or errors.
    cognee_context = graph_context
    retrieval_source = "bfs-fallback"
    try:
        import cognee
        from cognee.api.v1.search import SearchType
        from cognee.modules.users.methods import get_default_user

        dataset_name = f"user_{request.user_id}"
        user = await get_default_user()
        print(f"Cognee graph retrieval on dataset: {dataset_name}")
        results = await cognee.search(
            query_text=query,
            query_type=SearchType.GRAPH_COMPLETION,
            datasets=[dataset_name],
            user=user,
            only_context=True,
            top_k=20,
        )
        retrieved = _extract_cognee_context(results)
        if retrieved.strip():
            cognee_context = retrieved
            retrieval_source = "cognee-graph"
            print(f"Cognee retrieval OK ({len(retrieved)} chars from graph)")
        else:
            print("Cognee retrieval returned no context; using BFS fallback.")
    except Exception as e:
        print(f"Cognee search failed: {e}; using BFS fallback.")
        cognee_context = graph_context
    # ----------------------------------------

    # 2. Build traversal path (visual highlight only)
    traversal_path = build_traversal_path_from_user_data(request)
    
    # 3. Call LLM for reasoning (Claude → Gemini → Mock fallback)
    warning = ""
    context_label = "retrieved via Cognee knowledge graph" if retrieval_source == "cognee-graph" else "assembled from patient records"
    user_content = f"Clinical Query: {query}\n\nPatient Medical Graph Data ({context_label}):\n{cognee_context}"
    
    if async_anthropic_client:
        try:
            response = await async_anthropic_client.messages.create(
                model=os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20240620"),
                max_tokens=1200,
                system=CLINICAL_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_content}]
            )
            block = response.content[0]
            warning = block.text if hasattr(block, 'text') else str(block)
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
    
    src_label = "Cognee graph retrieval" if retrieval_source == "cognee-graph" else "records fallback (Cognee empty)"
    return {
        "warning": warning,
        "cognee_context": cognee_context,
        "retrieval_source": retrieval_source,
        "traversal_path": traversal_path,
        "scenario_description": f"{src_label}: {len(traversal_path['nodes'])} nodes, {len(traversal_path['edges'])} edges highlighted."
    }

@app.post("/api/build-graph")
async def build_graph(request: BuildGraphRequest):
    """Build the Cognee semantic graph for a user by pruning first, then adding and cognifying."""
    try:
        import cognee
        from cognee.infrastructure.databases.graph import get_graph_engine
        from cognee.context_global_variables import set_database_global_context_variables
        from cognee.modules.users.methods import get_default_user
        from cognee.infrastructure.databases.relational import get_relational_engine
        
        # 1. Build text context from user data
        dummy_query_request = UserQueryRequest(query="", user_id=request.user_id, user_data=request.user_data)
        graph_context = build_context_from_user_data(dummy_query_request)
        
        dataset_name = f"user_{request.user_id}"
        user = await get_default_user()

        # Scoped rebuild: empty ONLY this user's dataset instead of a global prune.
        # A global prune_system()/prune_data() would wipe every user's graph. Worse,
        # prune_system() alone leaves the relational data-item records behind, so on a
        # rebuild cognee.add() deduplicates the identical content by hash and cognify()
        # skips it, leaving the graph empty. empty_dataset() clears this dataset's graph
        # nodes/edges AND its data-item records, so the re-added content is reprocessed,
        # while other users' datasets are left untouched.
        print(f"Clearing existing Cognee dataset: {dataset_name}")
        existing = await cognee.datasets.list_datasets(user)
        for d in existing:
            if d.name == dataset_name:
                await cognee.datasets.empty_dataset(d.id, user)

        print(f"Adding new data to dataset: {dataset_name}")
        await cognee.add(data=graph_context, dataset_name=dataset_name)

        # Scope cognify to this dataset so we don't reprocess unrelated stale datasets.
        print("Cognifying graph...")
        await cognee.cognify(datasets=[dataset_name])
        
        # Fetch the visual graph nodes & edges directly from Cognee.
        # cognify() runs inside a scoped ContextVar that points the graph engine
        # to a per-user/per-dataset Ladybug DB. After cognify() returns, that context
        # is released, so we must re-establish it before calling get_graph_engine().
        print("Retrieving visual graph data...")

        # Look up the dataset ID that cognee.add() created for our dataset_name
        from cognee.modules.data.models import Dataset
        from sqlalchemy import select
        engine = get_relational_engine()
        dataset_id = None
        async with engine.get_async_session() as session:
            result = await session.execute(
                select(Dataset).where(Dataset.name == dataset_name)
            )
            dataset = result.scalars().first()
            if dataset:
                dataset_id = dataset.id

        nodes, edges = [], []
        if dataset_id:
            async with set_database_global_context_variables(dataset_id, user.id):
                graph_engine = await get_graph_engine()
                raw_graph_data = await graph_engine.get_graph_data()
                nodes, edges = raw_graph_data
        else:
            print(f"WARNING: Dataset '{dataset_name}' not found after cognify. Falling back to root graph engine.")
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
    
    if async_anthropic_client:
        try:
            response = await async_anthropic_client.messages.create(
                model=os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20240620"),
                max_tokens=1000,
                system=demo_system_prompt,
                messages=[
                    {"role": "user", "content": user_content}
                ]
            )
            block = response.content[0]
            warning = block.text if hasattr(block, 'text') else str(block)
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

class ParseNoteRequest(BaseModel):
    note_text: str
    patient_id: str
    profiles: list

class AddFactsRequest(BaseModel):
    user_id: str
    note_id: int
    facts: list[str]

class RemoveNoteRequest(BaseModel):
    user_id: str
    note_id: int

async def call_llm_json(system_prompt: str, user_content: str) -> dict:
    """Helper to query the available LLM and return parsed JSON."""
    response_text = ""
    
    # Try OpenAI first (skip if provider has been swapped to Gemini)
    llm_provider = os.getenv("LLM_PROVIDER", "").lower()
    openai_key = os.getenv("LLM_API_KEY")
    if openai_key and not openai_key.startswith("your-") and llm_provider not in ("gemini",):
        try:
            import openai
            client = openai.AsyncOpenAI(api_key=openai_key)
            response = await client.chat.completions.create(
                model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                response_format={"type": "json_object"}
            )
            response_text = response.choices[0].message.content
        except Exception as e:
            print(f"OpenAI error in call_llm_json: {e}")
            
    # Try Anthropic as first fallback
    if not response_text and async_anthropic_client:
        try:
            response = await async_anthropic_client.messages.create(
                model=os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20240620"),
                max_tokens=1000,
                system=system_prompt + "\n\nYou MUST reply with a valid JSON object ONLY. Do not wrap in markdown blocks like ```json.",
                messages=[{"role": "user", "content": user_content}]
            )
            block = response.content[0]
            response_text = block.text if hasattr(block, 'text') else str(block)
        except Exception as e:
            print(f"Anthropic error in call_llm_json: {e}")
            
    # Try Gemini as second fallback
    if not response_text and gemini_client:
        try:
            response = gemini_client.models.generate_content(
                model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
                contents=f"{system_prompt}\n\nYou MUST reply with a valid JSON object ONLY. Do not wrap in markdown blocks like ```json.\n\n{user_content}"
            )
            response_text = response.text
        except Exception as e:
            print(f"Gemini error in call_llm_json: {e}")
            
    if not response_text:
        raise HTTPException(status_code=500, detail="No LLM client is available to parse the note.")
        
    response_text = response_text.strip()
    if response_text.startswith("```json"):
        response_text = response_text[7:]
    if response_text.endswith("```"):
        response_text = response_text[:-3]
    response_text = response_text.strip()
    
    try:
        return json.loads(response_text)
    except Exception as e:
        print(f"Failed to parse LLM response as JSON: {response_text}")
        raise HTTPException(status_code=500, detail=f"LLM did not return valid JSON: {str(e)}")

@app.post("/api/notes/parse")
async def parse_clinical_note(request: ParseNoteRequest):
    """Parses clinical note using the LLM to extract summary, semantic facts, and suggestible structured hard facts."""
    system_prompt = (
        "You are an expert clinical NLP parser. Your job is to extract structured and semantic facts from a raw clinical note.\n"
        "You must return a valid JSON object with the following keys:\n"
        "- 'summary': A 5-word summary of the clinical note.\n"
        "- 'semantic_facts': A list of string facts detailing symptoms, qualifiers, or hereditary conditions in plain sentences. "
        "Make them atomic and refer to the patient by name (e.g. 'Mamata Patra has severe joint stiffness in the morning').\n"
        "- 'hard_facts': A list of dictionary objects, each representing a structured medication or condition to be saved. "
        "Each dict must contain: \n"
        "  * 'patient_name': The full name of the patient (e.g. 'Mamata Patra').\n"
        "  * 'resolved_id': Match the patient name to the list of Available Profiles. If matched, set to their UUID. If not, default to the active patient's UUID.\n"
        "  * 'record_type': 'condition' or 'medication'.\n"
        "  * 'name': The clean name of the medication or condition (e.g. 'Plaque Psoriasis', 'Sevoflurane').\n"
        "  * 'metadata': A dictionary. For conditions, you MUST include a 'condition_type' field set to exactly one of: "
        "'Genetic', 'Autoimmune', 'Chronic', 'Symptom', 'Allergy'. Use these classification rules:\n"
        "    - 'Genetic': Inherited genetic markers or deficiencies (e.g. CYP2D6 Deficiency, Malignant Hyperthermia Susceptibility, Sickle Cell Trait).\n"
        "    - 'Autoimmune': Autoimmune diseases (e.g. Psoriasis, Lupus, Rheumatoid Arthritis, Crohn's Disease).\n"
        "    - 'Chronic': Chronic non-autoimmune conditions (e.g. Hypertension, Diabetes, COPD).\n"
        "    - 'Symptom': Acute symptoms or complaints (e.g. Joint Stiffness, Cough, Bilateral Knee Pain, Respiratory Distress).\n"
        "    - 'Allergy': Allergies or hypersensitivities (e.g. Penicillin Allergy, Latex Allergy).\n"
        "  For medications, include optional 'dosage' and 'status' (e.g. 'Active', 'Proposed').\n"
    )
    
    profiles_formatted = "\n".join([f"- UUID: {p.get('id')}, Name: {p.get('full_name')}" for p in request.profiles])
    user_content = (
        f"Active Patient UUID: {request.patient_id}\n\n"
        f"Available Patient Profiles in family network:\n{profiles_formatted}\n\n"
        f"Clinical Note to Parse:\n\"{request.note_text}\""
    )
    
    try:
        parsed_data = await call_llm_json(system_prompt, user_content)
        return parsed_data
    except Exception as e:
        print(f"Failed parsing note: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/graph/add-facts")
async def add_facts_to_graph(request: AddFactsRequest):
    """Incrementally add new semantic facts to the Cognee graph without pruning existing data."""
    try:
        import cognee
        
        dataset_name = f"user_{request.user_id}_note_{request.note_id}"
        facts_text = "\n".join(request.facts)
        
        print(f"Incrementally adding facts to Cognee dataset: {dataset_name}")
        await cognee.add(data=facts_text, dataset_name=dataset_name)
        
        print(f"Cognifying new facts...")
        await cognee.cognify()
        
        return {"success": True, "dataset": dataset_name, "facts_added": len(request.facts)}
    except Exception as e:
        print(f"Failed to add facts to Cognee: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/graph/remove-note")
async def remove_note_from_graph(request: RemoveNoteRequest):
    """Remove a specific note's dataset from the Cognee graph."""
    dataset_name = f"user_{request.user_id}_note_{request.note_id}"
    try:
        import cognee
        from cognee.modules.users.methods import get_default_user

        print(f"Deleting Cognee dataset: {dataset_name}")
        # Scope deletion to this one dataset instead of prune_data(), which wipes ALL
        # users' data. empty_dataset() removes the dataset's graph nodes/edges and its
        # relational data-item records. (Note: this cognee version has no
        # delete_dataset(); empty_dataset() is the supported per-dataset removal.)
        user = await get_default_user()
        datasets = await cognee.datasets.list_datasets(user)
        target = [d for d in datasets if d.name == dataset_name]
        if target:
            await cognee.datasets.empty_dataset(target[0].id, user)
            return {"success": True, "pruned_dataset": dataset_name}
        else:
            print(f"Dataset '{dataset_name}' not found in Cognee, nothing to prune.")
            return {"success": True, "pruned_dataset": dataset_name, "detail": "Dataset not found, may have already been removed."}
    except Exception as e:
        print(f"Failed to prune Cognee dataset: {e}")
        # Non-fatal: dataset may not exist if graph was never built for this note
        return {"success": False, "detail": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
