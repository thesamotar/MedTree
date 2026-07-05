'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import GraphPane from '@/components/GraphPane';
import ChatPane from '@/components/ChatPane';
import DataEntryPane from '@/components/DataEntryPane';
import { LogOut, ArrowLeft, ArrowRight, Activity, RefreshCw } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  // Auth state
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App state: 'entry' | 'results'
  const [appState, setAppState] = useState('entry');

  // Data States
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [clinicalNotes, setClinicalNotes] = useState([]);
  const [semanticFacts, setSemanticFacts] = useState([]);

  // Traversal and Loading States
  const [traversalPath, setTraversalPath] = useState({ nodes: [], edges: [] });
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [isGraphBuilt, setIsGraphBuilt] = useState(false);
  const [isBuildingGraph, setIsBuildingGraph] = useState(false);

  // Load all user and connection data
  const loadAllData = useCallback(async (currUser) => {
    // 1. Fetch or create user profile
    let { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currUser.id)
      .maybeSingle();

    if (!prof) {
      const defaultName = currUser.email.split('@')[0];
      const { data: inserted, error: insertErr } = await supabase
        .from('profiles')
        .insert({ id: currUser.id, full_name: defaultName, age: null })
        .select()
        .single();
      prof = inserted;
    }
    setProfile(prof);

    // 2. Fetch all accessible medical records
    const { data: records } = await supabase
      .from('medical_records')
      .select('*')
      .order('created_at', { ascending: true });
    setMedicalRecords(records || []);

    // 3. Fetch all relationships
    const { data: rels } = await supabase
      .from('relationships')
      .select('*');
    setRelationships(rels || []);

    // 4. Fetch clinical notes logs — ONLY this user's own notes. RLS would otherwise return
    // connected relatives' notes too (the same transitive consent that shares records for the
    // graph), which over-shares the raw note log across accounts. The derived records/semantic
    // facts remain shared for multi-hop analysis; only the visible note log is scoped to self.
    const { data: notes } = await supabase
      .from('clinical_notes')
      .select('*')
      .eq('patient_id', currUser.id)
      .order('created_at', { ascending: false });
    setClinicalNotes(notes || []);

    // 5. Fetch semantic facts list
    const { data: facts } = await supabase
      .from('semantic_facts')
      .select('fact_text');
    setSemanticFacts((facts || []).map(f => f.fact_text));

    // 6. Fetch all profiles to resolve names
    const { data: allProfs } = await supabase
      .from('profiles')
      .select('*');
    setProfiles(allProfs || []);

    // Return fetched data so callers can use it immediately
    return {
      profiles: allProfs || [],
      records: records || [],
      relationships: rels || [],
      facts: (facts || []).map(f => f.fact_text),
    };
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // Build graph data from user entries for visualization
  const buildGraphFromEntries = useCallback((profs, records, rels, currUser, facts = []) => {
    if (!currUser) return { nodes: [], edges: [] };
    const nodes = [];
    const edges = [];

    const toId = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '_');

    // 1. Build a map of profiles
    const profilesMap = {};
    profs.forEach(p => {
      profilesMap[p.id] = p;
    });

    // 2. Perform BFS to find all reachable profiles from currUser
    const reachableUsers = new Set([currUser.id]);
    const queue = [currUser.id];

    while (queue.length > 0) {
      const currentId = queue.shift();
      rels.forEach(rel => {
        if (rel.status === 'active') {
          if (rel.requester_id === currentId && rel.receiver_id in profilesMap && !reachableUsers.has(rel.receiver_id)) {
            reachableUsers.add(rel.receiver_id);
            queue.push(rel.receiver_id);
          } else if (rel.receiver_id === currentId && rel.requester_id in profilesMap && !reachableUsers.has(rel.requester_id)) {
            reachableUsers.add(rel.requester_id);
            queue.push(rel.requester_id);
          }
        }
      });
    }

    // 3. Add reachable users to nodes
    reachableUsers.forEach(uId => {
      const uProf = profilesMap[uId];
      if (uProf) {
        let group = 'Relative/Connection';
        if (uId === currUser.id) {
          group = 'Self';
        } else {
          // Find direct relationship type to currUser if any, or default to Relative
          const directRel = rels.find(rel => 
            rel.status === 'active' && 
            ((rel.requester_id === currUser.id && rel.receiver_id === uId) ||
             (rel.receiver_id === currUser.id && rel.requester_id === uId))
          );
          if (directRel) {
            group = directRel.relationship_type;
          }
        }

        nodes.push({
          id: uId,
          label: uProf.full_name,
          type: 'Patient',
          group: group,
        });
      }
    });

    // 4. Add relationship edges between reachable users
    const processedRels = new Set();
    rels.forEach(rel => {
      if (rel.status === 'active' && reachableUsers.has(rel.requester_id) && reachableUsers.has(rel.receiver_id)) {
        const reqProf = profilesMap[rel.requester_id];
        const recProf = profilesMap[rel.receiver_id];
        if (reqProf && recProf) {
          const sortedIds = [rel.requester_id, rel.receiver_id].sort();
          const relKey = sortedIds.join('_');
          if (!processedRels.has(relKey)) {
            processedRels.add(relKey);
            
            // Determine direction/label based on age
            let edgeLabel = rel.relationship_type;
            let sourceId = rel.requester_id;
            let targetId = rel.receiver_id;

            if (rel.relationship_type === 'Parent-Child') {
              if ((reqProf.age || 0) < (recProf.age || 0)) {
                edgeLabel = 'CHILD_OF';
                sourceId = rel.requester_id;
                targetId = rel.receiver_id;
              } else {
                edgeLabel = 'PARENT_OF';
                sourceId = rel.receiver_id;
                targetId = rel.requester_id;
              }
            } else if (rel.relationship_type === 'Roommate') {
              edgeLabel = 'LIVES_WITH';
            } else if (rel.relationship_type === 'Sibling-Sibling') {
              edgeLabel = 'SIBLING_OF';
            } else if (rel.relationship_type === 'Spouse') {
              edgeLabel = 'SPOUSE_OF';
            }

            edges.push({
              id: `e_${sortedIds[0]}_${sortedIds[1]}`,
              source: sourceId,
              target: targetId,
              label: edgeLabel,
            });
          }
        }
      }
    });

    // 5. Add medical records (Conditions and Medications) for reachable users
    const activeRecords = records.filter(r => reachableUsers.has(r.user_id));

    activeRecords.forEach(r => {
      const conceptId = toId(r.name);
      
      // Add concept node if not already present (shared nodes)
      if (!nodes.find(n => n.id === conceptId)) {
        if (r.record_type === 'condition') {
          const typeMap = {
            'Genetic': 'GeneticCondition',
            'Autoimmune': 'AutoimmuneCondition',
            'Symptom': 'Symptom',
            'Allergy': 'Risk',
            'Chronic': 'AutoimmuneCondition',
            'Infection': 'Infection',
          };
          nodes.push({
            id: conceptId,
            label: r.name,
            type: typeMap[r.metadata?.condition_type] || 'AutoimmuneCondition',
            group: r.metadata?.condition_type || 'Chronic',
          });
        } else if (r.record_type === 'medication') {
          nodes.push({
            id: conceptId,
            label: r.name,
            type: 'Medication',
            group: 'medication',
          });
        }
      }

      // Add edge from person to condition/medication
      const label = r.record_type === 'condition'
        ? 'HAS_CONDITION'
        : (r.metadata?.status === 'Proposed' ? 'PRESCRIBED' : 'TAKES');

      edges.push({
        id: `e_${r.user_id}_${conceptId}`,
        source: r.user_id,
        target: conceptId,
        label,
      });
    });

    // 6. Add family-history conditions parsed from cross-account semantic facts.
    // A relative's conditions can't be written to their own medical_records (RLS blocks
    // writing to another account), so the note-approval flow stores them as structured
    // text like "Mamata Patra has Genetic condition: RYR1 Mutation". Render them as
    // virtual condition nodes attached to the real relative (matched by name), or to a
    // virtual person node if the relative has no profile. Kept in sync with the backend
    // parser (FAMILY_FACT_RE / build_traversal_path_from_user_data in main.py).
    const familyFactRegex = /^(.+?) has (?:(Genetic|Autoimmune|Chronic|Symptom|Allergy|Infection) )?(condition|medication): (.+)$/i;
    const condTypeMap = {
      Genetic: 'GeneticCondition',
      Autoimmune: 'AutoimmuneCondition',
      Symptom: 'Symptom',
      Allergy: 'Risk',
      Chronic: 'AutoimmuneCondition',
      Infection: 'Infection',
    };
    (facts || []).forEach((factText) => {
      const m = familyFactRegex.exec((factText || '').trim());
      if (!m) return;
      const subjectName = m[1].trim();
      const conditionType = m[2] || 'Chronic';
      const recordType = m[3].toLowerCase();
      const name = m[4].trim();

      // Resolve subject: exact name -> first-name/partial -> virtual person node.
      let subjectNodeId = null;
      const exact = profs.find(
        (p) => reachableUsers.has(p.id) && p.full_name &&
          p.full_name.toLowerCase() === subjectName.toLowerCase()
      );
      if (exact) {
        subjectNodeId = exact.id;
      } else {
        const partial = profs.find(
          (p) => reachableUsers.has(p.id) && p.full_name &&
            (p.full_name.toLowerCase().startsWith(subjectName.toLowerCase()) ||
             subjectName.toLowerCase().startsWith(p.full_name.toLowerCase().split(' ')[0]))
        );
        if (partial) {
          subjectNodeId = partial.id;
        } else {
          subjectNodeId = `fam_${toId(subjectName)}`;
          if (!nodes.find((n) => n.id === subjectNodeId)) {
            nodes.push({ id: subjectNodeId, label: subjectName, type: 'Patient', group: 'Relative/Connection' });
            edges.push({ id: `e_${currUser.id}_${subjectNodeId}`, source: currUser.id, target: subjectNodeId, label: 'FAMILY_HISTORY' });
          }
        }
      }

      const conceptId = toId(name);
      if (!nodes.find((n) => n.id === conceptId)) {
        nodes.push(
          recordType === 'condition'
            ? { id: conceptId, label: name, type: condTypeMap[conditionType] || 'AutoimmuneCondition', group: conditionType }
            : { id: conceptId, label: name, type: 'Medication', group: 'medication' }
        );
      }
      const edgeId = `e_${subjectNodeId}_${conceptId}`;
      if (!edges.find((e) => e.id === edgeId)) {
        edges.push({
          id: edgeId,
          source: subjectNodeId,
          target: conceptId,
          label: recordType === 'condition' ? 'HAS_CONDITION' : 'TAKES',
        });
      }
    });

    return { nodes, edges };
  }, []);

  // Check auth on mount (declared after buildGraphFromEntries since it uses it).
  useEffect(() => {
    const checkUser = async () => {
      // Read the persisted "graph was built" flag synchronously before any await, so the
      // localStorage sync effect (which runs during the first await) can't clobber it.
      const wasBuilt = typeof window !== 'undefined' && localStorage.getItem('medtree_graph_built') === 'true';
      const { data: { user: currUser } } = await supabase.auth.getUser();
      if (!currUser) {
        router.push('/login');
        return;
      }
      setUser(currUser);
      setAuthLoading(false);
      const data = await loadAllData(currUser);
      // Restore the built graph across refreshes: the visual graph is derived from Supabase
      // data, so we can rebuild it immediately instead of forcing the user to regenerate.
      if (wasBuilt) {
        const fullGraph = buildGraphFromEntries(data.profiles, data.records, data.relationships, currUser, data.facts);
        setGraphData(fullGraph);
        setTraversalPath({ nodes: [], edges: [] });
        setIsGraphBuilt(true);
        setAppState('results');
      }
    };
    checkUser();
  }, [router, loadAllData, buildGraphFromEntries]);

  // Persist the "graph built" flag so a page refresh restores the graph view instead of
  // dropping the user back to the "Generate Tree" screen.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isGraphBuilt) localStorage.setItem('medtree_graph_built', 'true');
    else localStorage.removeItem('medtree_graph_built');
  }, [isGraphBuilt]);

  // Single handler for ANY data change (note approval, note deletion, manual record
  // add/remove, relationship changes). The visual graph is derived from live Supabase
  // data, and queries analyze the live payload (not Cognee's stored graph), so a data
  // change never requires regenerating the tree. We just refresh the graph in place and
  // clear any stale query highlight so the update is visible. isGraphBuilt is left as-is,
  // so the user is never bounced back to the "Generate Tree" screen after editing data.
  const handleDataChange = useCallback(async () => {
    if (!user) return;
    const data = await loadAllData(user);
    const fullGraph = buildGraphFromEntries(data.profiles, data.records, data.relationships, user, data.facts);
    setGraphData(fullGraph);
    setTraversalPath({ nodes: [], edges: [] });
  }, [user, loadAllData, buildGraphFromEntries]);

  // Analyze query
  const handleAnalyze = async (queryText) => {
    setIsLoading(true);
    try {
      // Prepare consensual query payload
      const payload = {
        query: queryText,
        user_id: user.id,
        user_data: {
          profiles: profiles,
          medical_records: medicalRecords,
          relationships: relationships,
          semantic_facts: semanticFacts,
        },
      };

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/analyze-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Backend error');
      const data = await res.json();

      // Build full graph from current state
      const fullGraph = buildGraphFromEntries(profiles, medicalRecords, relationships, user, semanticFacts);
      setGraphData(fullGraph);
      setTraversalPath(data.traversal_path || { nodes: [], edges: [] });
      setAppState('results');
      setIsLoading(false);
      return data;
    } catch (err) {
      console.error('Analysis failed:', err);

      // Fallback: build graph locally and show it
      const fullGraph = buildGraphFromEntries(profiles, medicalRecords, relationships, user, semanticFacts);
      setGraphData(fullGraph);
      setTraversalPath({
        nodes: fullGraph.nodes.map(n => n.id),
        edges: fullGraph.edges.map(e => e.id),
      });
      setAppState('results');
      setIsLoading(false);

      return {
        warning: `### ℹ️ Offline Analysis\n\nThe backend is not running. Showing your full consensual medical graph. Connect the FastAPI backend for AI-powered risk analysis.\n\n**Your query:** ${queryText}`,
        traversal_path: { nodes: fullGraph.nodes.map(n => n.id), edges: fullGraph.edges.map(e => e.id) },
        scenario_description: 'Full graph displayed (offline mode).',
      };
    }
  };

  const handleBackToEntry = () => {
    setAppState('entry');
    setTraversalPath({ nodes: [], edges: [] });
  };

  const handleViewGraph = () => {
    setAppState('results');
  };

  const handleBuildGraph = async () => {
    setIsBuildingGraph(true);
    try {
      const payload = {
        user_id: user.id,
        user_data: {
          profiles: profiles,
          medical_records: medicalRecords,
          relationships: relationships,
          semantic_facts: semanticFacts,
        },
      };

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/build-graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Backend error');
      await res.json(); // Cognee builds its semantic memory server-side (used for querying).

      // Always render the *visual* graph from structured Supabase data. Cognee's raw
      // get_graph_data() returns [uuid, {props}] tuples keyed by Cognee-generated UUIDs
      // (plus internal DocumentChunk/TextSummary nodes) — those don't match our profile
      // IDs and can't drive GraphPane's self-view, so feeding them in left the pane blank.
      const fullGraph = buildGraphFromEntries(profiles, medicalRecords, relationships, user, semanticFacts);
      setGraphData(fullGraph);

      // Clear any stale query highlight so the initial view shows the user's own
      // conditions/medications (GraphPane's no-highlight branch).
      setTraversalPath({ nodes: [], edges: [] });

      setIsGraphBuilt(true);
      setAppState('results');
    } catch (err) {
      console.error('Failed to build graph:', err);
      alert('Failed to construct Cognee graph. Check that your backend is running.');
    } finally {
      setIsBuildingGraph(false);
    }
  };

  // Regenerate: wipe this user's Cognee dataset (in case it was poisoned/stale from an early
  // build) via the forget-based reset, then rebuild it cleanly from current data.
  const handleRegenerate = async () => {
    if (!user || isBuildingGraph) return;
    setIsBuildingGraph(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      await fetch(`${apiUrl}/api/graph/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
    } catch (err) {
      console.error('Graph reset failed (non-fatal, rebuilding anyway):', err);
    }
    // handleBuildGraph manages its own building state + rebuilds the view.
    await handleBuildGraph();
  };

  if (authLoading) {
    return (
      <div className="loading-screen">
        <Activity size={40} className="pulse-icon" style={{ color: '#66fcf1' }} />
        <p>Loading MedTree…</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Top bar */}
      <div className="app-topbar">
        <div className="topbar-left">
          {appState === 'results' && (
            <button className="topbar-btn" onClick={handleBackToEntry}>
              <ArrowLeft size={16} /> Back to Data Entry
            </button>
          )}
          {appState === 'results' && isGraphBuilt && (
            <button
              className="topbar-btn"
              onClick={handleRegenerate}
              disabled={isBuildingGraph}
              title="Wipe and rebuild this graph (use if the graph looks stale or broken)"
            >
              <RefreshCw size={14} className={isBuildingGraph ? 'animate-spin' : ''} />
              {isBuildingGraph ? 'Regenerating…' : 'Regenerate Graph'}
            </button>
          )}
          {appState === 'entry' && isGraphBuilt && (
            <button className="topbar-btn" onClick={handleViewGraph}>
              View Graph <ArrowRight size={16} />
            </button>
          )}
          <div className="topbar-brand">
            <Activity size={18} style={{ color: '#66fcf1' }} />
            <span>MedTree</span>
          </div>
        </div>
        <div className="topbar-right">
          <span className="topbar-email">{user?.email}</span>
          <button className="topbar-btn topbar-logout" onClick={handleLogout}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="app-main">
        {/* Left pane: Data Entry OR Graph */}
        <div className={`left-pane ${appState === 'results' ? 'show-graph' : 'show-entry'}`}>
          {appState === 'entry' ? (
            <DataEntryPane
              userId={user?.id}
              profile={profile}
              profiles={profiles}
              medicalRecords={medicalRecords}
              relationships={relationships}
              clinicalNotes={clinicalNotes}
              onDataChange={handleDataChange}
              onBuildGraph={handleBuildGraph}
              isBuildingGraph={isBuildingGraph}
              isGraphBuilt={isGraphBuilt}
            />
          ) : (
            <div className="graph-section">
              <GraphPane graphData={graphData} traversalPath={traversalPath} userId={user?.id} />
            </div>
          )}
        </div>

        {/* Right pane: Chat */}
        <div className="right-pane">
          <ChatPane
            onAnalyze={handleAnalyze}
            isLoading={isLoading}
            profiles={profiles}
            medicalRecords={medicalRecords}
            relationships={relationships}
            appState={appState}
            user={user}
            isGraphBuilt={isGraphBuilt}
            isBuildingGraph={isBuildingGraph}
            onBuildGraph={handleBuildGraph}
            onDataChange={handleDataChange}
          />
        </div>
      </div>
    </div>
  );
}
