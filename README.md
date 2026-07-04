# MedTree (Medical Correlation Engine)

A high-stakes Emergency Medical Decision Support system submitted for the WeMakeDevs Cognee Hackathon. MedTree uses Cognee's hybrid graph-vector memory layer coupled with Anthropic's Claude 3.5 to traverse patient relationships and flag hidden clinical risks (pharmacogenomics, autoimmune clusters, proximity hazards).

## Project Structure
- `/backend`: FastAPI backend managing the Cognee graph database and AI reasoning.
- `/frontend`: Next.js web application visualising active traversal paths with React Flow.

## Setup Instructions

### Backend Setup
1. Navigate to `/backend`
2. Create a virtual environment: `python3 -m venv venv` and activate it.
3. Install dependencies: `pip install -r requirements.txt`
4. Set up your `.env` file based on `.env.example`.
5. Seed the graph database: `python seed.py`
6. Run the server: `uvicorn main:app --reload`

### Frontend Setup
1. Navigate to `/frontend`
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`

### Running from Root
You can also use the root `package.json` shortcuts:
- `npm run dev` — Start the Next.js frontend
- `npm run backend` — Start the FastAPI backend
- `npm run seed` — Run the Cognee seeding script

---

## Changelog

### v3.7 — Graph Layout, Navigation & Chat Formatting Polish (2026-07-04)

**Frontend (`/frontend`)**
- `page.js` — Added a topbar **"View Graph"** button (shown on the Data Entry screen once a graph has been built) so users can return to the graph view without having to send a chat query.
- `GraphPane.js` — Replaced the staggered-grid auto-layout with a **column-per-patient layered layout**: each patient/relationship node gets its own column on the top level, and that patient's conditions/medications are placed directly beneath them, so every item stays under the patient it belongs to (no cross-patient criss-cross).
- `GraphPane.js` — Each patient's items are packed into a **sub-grid of up to 3 nodes per row** (conditions band, then a medications band) so patients with many records stay compact instead of forming a long vertical stack.
- `GraphPane.js` & `CustomNode.js` — Added id'd handles on all four sides of each node and route edges accordingly: same-level **patient ↔ patient** links exit/enter from the **sides**, while **patient → condition/medication** links drop from the **bottom** into the child's **top**.
- `GraphPane.js` — Tightened `fitView` padding (and re-key on the visible node set) so the graph fills ~60–80% of the pane and re-centers when switching between the self view and a query traversal.
- `GraphPane.js` — De-duplicate nodes/edges by id before rendering to fix a React "two children with the same key" crash (a condition could arrive as both an own record and a family-history fact).
- `ChatPane.js` — Rewrote the lightweight markdown renderer into a **block-aware renderer** (no new dependencies): `#`–`####` headings, `---` rules, **GitHub-style pipe tables** (styled, horizontally scrollable), ordered/unordered lists, paragraphs, and inline `**bold**` / `*italic*`.
- `ChatPane.js` — Added **severity colour cues** for urgency keywords in clinical alerts, rationalised to four categories: `CRITICAL` (red), `URGENT` (orange), `MEDIUM` (yellow), `LOW` (green). Matched case-sensitively so uppercase levels are highlighted while the same words in ordinary prose are left untouched.

### v3.6 — Graph Rendering, Family-History Traversal & Live Update Fixes (2026-07-04)

**Backend (`/backend`)**
- `main.py` — Fixed the "No nodes found" empty-graph bug in `POST /api/build-graph`: `prune_system()` deleted the Ladybug graph files but left the relational data-item records, so re-added content was deduplicated by hash and skipped by `cognify()`. Cleanup is now **scoped to the user's own dataset** via `cognee.datasets.empty_dataset()` (clears both the dataset's graph nodes/edges and its data-item records) instead of a global prune, and `cognify()` is scoped to that dataset. Other users' graphs are left untouched.
- `main.py` — Re-established the per-user/per-dataset context (`set_database_global_context_variables`) before reading `get_graph_data()`, since the context that `cognify()` scopes the graph engine to is released when it returns.
- `main.py` — Fixed `POST /api/graph/remove-note`, which called a non-existent `cognee.datasets.delete_dataset()` and silently fell back to a global `prune_data()` (wiping all users). It now uses `empty_dataset()` scoped to the note's dataset.
- `main.py` — Extended the Malignant Hyperthermia trigger list to include all volatile/triggering anesthetic agents (`desflurane`, `isoflurane`, `halothane`, `enflurane`, `succinylcholine`, …) so queries like "is desflurane safe" surface the MH susceptibility link. Refactored trigger matching into a shared `_record_query_matches()` helper.
- `main.py` — Added family-history parsing to `build_traversal_path_from_user_data`: cross-account relative conditions (stored as structured `semantic_facts` text, e.g. "Mamata Patra has Genetic condition: RYR1 Mutation") are wired into the traversal graph as virtual condition nodes attached to the real relative, so an MH/anesthetic query traverses patient → relative → condition and excludes irrelevant branches.
- `main.py` — Unified the backend `to_id()` slug function to exactly match the frontend `toId()` (`[^a-z0-9] → _`), preventing mismatched/orphan node IDs between the rendered graph and the highlight set.

**Frontend (`/frontend`)**
- `page.js` — The visual graph is now always rendered from **structured Supabase data** (`buildGraphFromEntries`) instead of Cognee's raw `get_graph_data()` output. Cognee returns `[uuid, {props}]` tuples keyed by internal UUIDs that don't match profile IDs, which left the graph pane blank after generation.
- `page.js` — Render account-less relatives' conditions as **virtual nodes** parsed from `semantic_facts` (RLS forbids writing them to the relative's own `medical_records`), attached to the matching family member. Kept in sync with the backend parser.
- `page.js` — Persist the `isGraphBuilt` flag to `localStorage` and restore the graph on refresh, so a page reload no longer bounces the user back to the "Generate Tree" screen.
- `page.js` — Unified all data changes (note approval/deletion, manual record edits, relationship changes) into a single `handleDataChange` that refreshes the graph in place and clears any stale query highlight, and **no longer forces a full regenerate** — since `/api/analyze-user` reasons over the live request payload, data edits never require rebuilding the tree.
- `GraphPane.js` — Restored the default (no-query) view to show **only the logged-in patient and their own conditions/medications**; family members surface only when a query traverses to them. Added a guard that never renders an edge unless both endpoints are present, eliminating orphan `HAS_CONDITION` lines.
- `ChatPane.js` — Note deletion via `@remove_clinical_note` is now incremental (refresh visual graph only) rather than triggering a full graph regenerate.
- `DataEntryPane.js` — The clinical-note trash-delete button now also scope-prunes the note's Cognee dataset (mirroring the command path) and, via the unified handler, no longer reverts the UI to the "Generate Tree" screen.

### v3.5 — Incremental Ingestion, Editable Classifications, Command Palette, and Deletion Flow (2026-07-03)

**Database (`/supabase`)**
- `migration.sql` — Added `source_note_id` column to `medical_records` table with cascade delete foreign key.

**Backend (`/backend`)**
- `main.py` — Updated NLP note parsing prompt to classify extracted conditions into `Genetic`, `Autoimmune`, `Chronic`, `Symptom`, `Allergy`.
- `main.py` — Fixed `call_llm_json` fallback mechanism to skip OpenAI path when `LLM_PROVIDER` is set to Gemini.
- `main.py` — Added `POST /api/graph/add-facts` endpoint for incremental Cognee appending.
- `main.py` — Added `POST /api/graph/remove-note` endpoint to clear Cognee system cache.

**Frontend (`/frontend`)**
- `ChatPane.js` — Added editable dropdown selector for condition classifications in the note approval card.
- `ChatPane.js` — Split own-account saving from cross-account saving (saving cross-account updates as semantic facts to comply with RLS policies).
- `ChatPane.js` — Implemented command autocomplete dropdown menu when typing `@` commands, with keyboard Arrow/Enter navigation support.
- `ChatPane.js` & `page.js` — Restyled user clinical note command queries into custom console-style output bubbles.
- `page.js` & `ChatPane.js` — Kept app results view active and automatically recompiled Cognee graph in the background after note deletion to prevent screen resetting.

**Known Issues & Active Bugs**
- After deleting a clinical note and rebuilding the graph, concepts like "joint stiffness" and "bilateral knee pain" are sometimes retained in Cognee's persistent memory search context.

### v3.4 — Infinite-Hop RLS Policies & On-Demand Graph Compiling (2026-07-03)

**Database (`/supabase`)**
- `migration.sql` — Upgraded the 2-hop traversal limitation to a recursive CTE function `get_all_connected_profile_ids`, enabling genuine multi-hop queries to an infinite depth while preserving user privacy bounds.

**Backend (`/backend`)**
- `main.py` — Implemented the `/api/build-graph` endpoint to support isolated on-demand graph generation (utilizing `cognee.prune.prune_system()`, `cognee.add()`, and `cognee.cognify()`).
- `main.py` — Optimized the `/api/analyze-user` endpoint to run only `cognee.search()`, reducing chat query response time down to milliseconds.

**Frontend (`/frontend`)**
- `page.js` & `ChatPane.js` — Placed the graph build action as a glowing circular brain button at the center of the Chat lock screen overlay, complete with a clean uppercase label beneath it.
- `ChatPane.js` — Integrated an interactive progression bar that updates live with Cognee's compilation tasks (clearing cache, ingesting records, cognifying).
- `GraphPane.js` — Implemented an initial-state view when no query is active, displaying only the logged-in patient and their direct medical/prescriptive nodes.
- `GraphPane.js` & `globals.css` — Color-coded relationships (Orange), medical conditions (Purple), and medications (Green) with custom glowing path animation overrides.

**Backend (`/backend`)**
- `main.py` — Fixed the clinical trigger parsing algorithm to map generic keywords (`genetic`, `hereditary`, `inherited`, `risk`, `history`) to genetic conditions so that multi-hop lineages are correctly traversed and highlighted.

### v3.3 — Draggable Nodes, Pathway Filtering & Connection Fixes (2026-07-03)

**Frontend (`/frontend`)**
- `GraphPane.js` — Enabled draggable node states using React Flow's `useNodesState` and `useEdgesState` hooks to bind layout drag events directly.
- `GraphPane.js` — Updated node and edge drawing to filter out all non-relevant nodes entirely when an active traversal pathway is returned, centering the visualization on the specific medical pathway.
- `DataEntryPane.js` — Resolved a connection duplication bug where indirect secondary active relationships (e.g. Mamata ↔ Grandma) were incorrectly rendered under the current user's profile view.

### v3.2 (INCOMPLETE) — Real-Time Cognee Live Data Processing (2026-07-02)

> [!WARNING]
> **Status: Incomplete / Failing**
> This feature currently requires a paid OpenAI API key. The free-tier Gemini API key being used does not support the necessary LiteLLM embedding models (`text-embedding-004`) required by Cognee, resulting in a 404 error during real-time graph generation.

**Backend (`/backend`)**
- `main.py` — Refactored the `POST /api/analyze-user` endpoint to ingest dynamic Supabase JSON data directly into Cognee on the fly (`cognee.add()` and `cognee.cognify()`).
- `main.py` — Updated the prompt builder to utilize `cognee.search(SearchType.GRAPH_COMPLETION)` instead of the manual Python BFS text representation.
- `main.py` — Applied `os.environ` fallback logic to attempt dynamic Gemini overriding, but Litellm + Gemini embeddings fail without Google Cloud quota.

### v3.1 — Multi-Hop Transitive Traversal & Safe RLS Policies (2026-07-02)

**Database (`/supabase`)**
- `migration.sql` — Added `SECURITY DEFINER` helper function `get_direct_connection_ids` to retrieve relationships bypassing RLS, resolving infinite recursion/stack overflow during database SELECTs.
- `migration.sql` — Split `FOR ALL` relationship policy into explicit `FOR UPDATE` and `FOR DELETE` policies to fix silent failures during relationship deletion.
- Updated `relationships` and `medical_records` SELECT policies to support 2-hop transitive consensual sharing (e.g., Grandma ↔ Mom ↔ Me) safely.

**Backend (`/backend`)**
- `main.py` — Updated `build_context_from_user_data` using BFS to compile natural language context for all connected members in the network.
- `main.py` — Upgraded `build_traversal_path_from_user_data` to construct an adjacency graph, match clinical terms through trigger synonyms, and perform BFS shortest-path tree back-tracing to highlight multi-hop paths.
- `seed.py` — Fixed tuple unpacking crash on `get_graph_data()` output.

**Frontend (`/frontend`)**
- `app/page.js` — Refactored `buildGraphFromEntries` using BFS transitive graph traversal to discover and render all reachable user profiles and relationship edges.
- `components/DataEntryPane.js` — Improved duplicate connection logic to prevent duplicate requests only when the *exact relationship type* already exists between the users.
- `components/DataEntryPane.js` — Updated header UI to make the user age distinct with a prominent pill-style badge.
- `components/DataEntryPane.js` — Separated "Family & Connections" counter metrics to explicitly delineate active connections vs pending unverified invites.
- Synchronized edge IDs dynamically (`e_{sorted_ids}`) to guarantee matching between frontend visualization and backend path highlights.

### v3.0 — Consensual Cross-Account Graph & Strict Privacy (2026-07-01)

**Database (`/supabase`)**
- `migration.sql` — Total rewrite to deploy a consensual relational model:
  - Created `profiles` table (public search/display names).
  - Created `medical_records` table (strictly self-owned conditions/meds).
  - Created `relationships` table (active/pending user-to-user links).
  - Configured RLS policies: Users can only write their own records; SELECT is allowed for self or approved active links.
  - Added full cleanup directives (dropping all old structures and wiping `auth.users` for testing).

**Backend (`/backend`)**
- `main.py` — Refactored user reasoning to query across multiple profiles and relationships:
  - Redefined `UserData` schema with `Profile`, `MedicalRecord`, and `Relationship` models.
  - Updated context builder to map connection UUIDs to profile names and resolve relationships.
  - Refined graph traversal logic to highlight cross-account relative nodes and edges dynamically.

**Frontend (`/frontend`)**
- `components/DataEntryPane.js` — Redesigned into three consensual sections: My Identity Details, Family & Connections, and My Health Conditions/Medications (strictly self-entered).
  - Added hide/unhide toggle for the invite code.
  - Renamed panel from "Consensual Links" to "Family & Connections" and updated badge to show combined active and pending requests.
  - Constrained age field input to only allow non-negative (>= 0) values.
- `app/page.js` — Added auto-profile-seeding on first login and parallel loaders for consensual network data.
- `app/login/page.js` — Redesigned login screen to a modern split-pane design:
  - Left-aligned high-visibility stylized typography branding and taglines.
  - Right-aligned glassmorphic auth card.
  - Added custom-rendered interactive HTML5 Canvas background drawing animated nodes and proximity links.
  - Added forgot password flow via Supabase email resets.
  - Added show/hide visibility toggle for password fields (which automatically defaults to hidden on tab changes).
- `components/ChatPane.js` — Updated suggestion chip logic to scan self-owned records and active relationships.

### v2.0 — Interactive Data Entry & Supabase Auth (2026-06-30)

**Backend (`/backend`)**
- `main.py` — Added new `POST /api/analyze-user` endpoint to dynamically build graph context from user-provided inputs and perform clinical risk reasoning. Fixed CORS configuration to resolve wildcard vs credentials issue.
- `seed.py` — Updated fallback seeding output layout matching v2 specifications.

**Frontend (`/frontend`)**
- `utils/supabase/` [NEW] — Browser client, server client, and session middleware configuration for Supabase SSR.
- `middleware.js` [NEW] — Automatic session validation and cookies refresh.
- `app/login/page.js` [NEW] — Dark-theme Sign In & Sign Up auth portal.
- `app/auth/callback/route.js` [NEW] — Route handler for Supabase session code exchange.
- `app/page.js` — Complete rewrite to implement entry state (Data Entry Form) and results state (collapsible React Flow graph + chat).
- `components/DataEntryPane.js` [NEW] — Structured wizard allowing users to add/delete Persons, Conditions, Medications, and Locations in real-time.
- `components/GraphPane.js` — Upgraded to dynamically map, stagger layout, and render custom nodes from user-supplied datasets instead of hardcoded coordinates.
- `components/ChatPane.js` — Configured suggestion chips generated dynamically from user entries and stripped legacy buttons.
- `app/globals.css` — Styling updates for auth portal, data entry sections, animations, and topbar.

**Database (`/supabase`)**
- `migration.sql` [NEW] — Supabase database schema for the `medical_entries` table with Row Level Security (RLS) policies.

### v1.0 — MVP Scaffold (2026-06-30)

**Backend (`/backend`)**
- `main.py` — FastAPI server with two endpoints:
  - `GET /api/graph` — Returns the full seeded graph structure (nodes + edges)
  - `POST /api/analyze` — Accepts a clinical query, searches the Cognee graph for context, determines the traversal path, and calls Claude 3.5 for medical reasoning. Includes full mock/fallback responses when API keys are unavailable.
- `seed.py` — Cognee seeding script that ingests synthetic patient narratives into the graph memory layer. Gracefully falls back to writing a structured mock graph (`seeded_graph.json`) if no LLM API key is configured.
- `data/mock_data.json` — Three pre-seeded multi-hop patient scenarios:
  1. **Pharmacogenomics**: Codeine + CYP2D6 hereditary deficiency
  2. **Autoimmune Clustering**: Joint pain + hereditary psoriasis
  3. **Environmental Overlap**: Respiratory distress + shared toxic mold exposure
- `requirements.txt` — Python dependencies (FastAPI, Cognee, Anthropic, etc.)
- `.env.example` — Environment variable template for Cognee and Anthropic API keys

**Frontend (`/frontend`)**
- `app/page.js` — Main page with 60/40 split layout. Manages traversal state and API calls with full offline fallback logic for all 3 scenarios.
- `app/layout.js` — Root layout with SEO metadata.
- `app/globals.css` — Custom dark-mode clinical theme with CSS variables, neon glow effects, React Flow node/edge styling, and animated traversal highlights.
- `components/GraphPane.js` — React Flow canvas with preset node positions for 3 clustered scenarios, custom node types, edge label styling, and traversal path highlighting with neon animations.
- `components/CustomNode.js` — Custom React Flow node with color-coded left borders and Lucide icons per entity type (Patient, Medication, GeneticCondition, Risk, Location, etc.).
- `components/ChatPane.js` — Chat interface with preset demo trigger buttons, custom lightweight markdown renderer, loading states, and a free-text input for custom queries.

**Root**
- `package.json` — Root convenience scripts proxying into `frontend/` and `backend/`
- `.gitignore` — Python + Node.js ignores
- `README.md` — This file
