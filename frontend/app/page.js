'use client';

import React, { useState } from 'react';
import GraphPane from '../components/GraphPane';
import ChatPane from '../components/ChatPane';

export default function Home() {
  const [traversalPath, setTraversalPath] = useState({ nodes: [], edges: [] });
  const [isLoading, setIsLoading] = useState(false);

  const handleAnalyze = async (queryText) => {
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: queryText }),
      });

      if (!res.ok) throw new Error('API server returned error');
      const data = await res.json();
      
      // Update the glowing/active paths in the React Flow graph
      setTraversalPath(data.traversal_path || { nodes: [], edges: [] });
      setIsLoading(false);
      return data;
    } catch (err) {
      console.error('Failed to analyze clinical query:', err);
      setIsLoading(false);
      
      // Standalone Fallback logic to let presentation work even without backend running
      const lowerQuery = queryText.toLowerCase();
      let fallbackData = null;

      if (lowerQuery.includes('codeine') || lowerQuery.includes('alex') || lowerQuery.includes('jensen')) {
        fallbackData = {
          warning: "### ⚠️ CRITICAL ALERT: Hereditary Pharmacogenomic Risk (Fallback)\n\n**Patient:** Alex Jensen\n**Medication:** Codeine\n\n- **Genetic Marker:** Mother (Sarah Jensen) has **CYP2D6 Deficiency**.\n- **Clinical Risk:** Therapeutic Failure & Toxicity risk due to poor metabolism.\n- **Recommendation:** Avoid Codeine. Use **Morphine** or alternative non-prodrug analgesics.",
          cognee_context: "Local Graph Fallback Context",
          traversal_path: {
            nodes: ["alex_jensen", "sarah_jensen", "cyp2d6_deficiency", "codeine"],
            edges: ["e_alex_sarah", "e_sarah_cyp2d6", "e_cyp2d6_codeine", "e_alex_codeine"]
          },
          scenario_description: "Pharmacogenomics traversal: Alex -> Sarah -> CYP2D6 -> Codeine."
        };
      } else if (lowerQuery.includes('joints') || lowerQuery.includes('lily') || lowerQuery.includes('chen') || lowerQuery.includes('arthritis')) {
        fallbackData = {
          warning: "### ⚠️ ALERT: Hereditary Autoimmune Risk (Fallback)\n\n**Patient:** Lily Chen\n**Symptom:** Stiff Joints\n\n- **Family History:** Father (David Chen) has chronic **Psoriasis**.\n- **Clinical Risk:** Suspected early-onset **Psoriatic Arthritis** (PsA).\n- **Recommendation:** Refer to Rheumatology. Order HLA-B27 genetics and joint screening.",
          cognee_context: "Local Graph Fallback Context",
          traversal_path: {
            nodes: ["lily_chen", "david_chen", "psoriasis", "psoriatic_arthritis"],
            edges: ["e_lily_david", "e_david_psoriasis", "e_psoriasis_arthritis", "e_lily_arthritis"]
          },
          scenario_description: "Autoimmune clustering traversal: Lily -> David -> Psoriasis -> Psoriatic Arthritis."
        };
      } else if (lowerQuery.includes('respiratory') || lowerQuery.includes('marcus') || lowerQuery.includes('vance') || lowerQuery.includes('mold') || lowerQuery.includes('cough') || lowerQuery.includes('leo')) {
        fallbackData = {
          warning: "### ⚠️ DANGER ALERT: Environmental Overlap Detected (Fallback)\n\n**Patient:** Marcus Vance\n**Symptom:** Respiratory Distress\n\n- **Proximity:** Roommate (Leo Brooks) treated for identical distress.\n- **Source:** Apartment 3B has confirmed **Toxic Black Mold** in HVAC.\n- **Recommendation:** Immediately vacate Apartment 3B. Administer bronchodilators.",
          cognee_context: "Local Graph Fallback Context",
          traversal_path: {
            nodes: ["marcus_vance", "leo_brooks", "apartment_3b", "toxic_mold", "respiratory_distress"],
            edges: ["e_marcus_leo", "e_marcus_apt", "e_leo_apt", "e_leo_respiratory", "e_apt_mold", "e_mold_respiratory", "e_marcus_respiratory"]
          },
          scenario_description: "Environmental overlap traversal: Marcus -> Leo -> Apt 3B -> Mold -> Respiratory Distress."
        };
      } else {
        fallbackData = {
          warning: "### ℹ️ Analysis Complete (Fallback)\n\nQuery processed. No matching critical medical risk loops found in the local graph.",
          cognee_context: "Local Graph Fallback Context",
          traversal_path: { nodes: [], edges: [] },
          scenario_description: "No path activated."
        };
      }

      setTraversalPath(fallbackData.traversal_path);
      return fallbackData;
    }
  };

  return (
    <div className="app-container">
      <div className="graph-section">
        <GraphPane traversalPath={traversalPath} />
      </div>
      <div className="chat-section">
        <ChatPane onAnalyze={handleAnalyze} isLoading={isLoading} />
      </div>
    </div>
  );
}
