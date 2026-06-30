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
