'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import GraphPane from '@/components/GraphPane';
import ChatPane from '@/components/ChatPane';
import DataEntryPane from '@/components/DataEntryPane';
import { LogOut, ArrowLeft, Activity } from 'lucide-react';

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

  // Traversal and Loading States
  const [traversalPath, setTraversalPath] = useState({ nodes: [], edges: [] });
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [isLoading, setIsLoading] = useState(false);

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

    // 4. Fetch all profiles to resolve names
    const { data: allProfs } = await supabase
      .from('profiles')
      .select('*');
    setProfiles(allProfs || []);
  }, [supabase]);

  // Check auth on mount
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user: currUser } } = await supabase.auth.getUser();
      if (!currUser) {
        router.push('/login');
        return;
      }
      setUser(currUser);
      setAuthLoading(false);
      await loadAllData(currUser);
    };
    checkUser();
  }, [router, loadAllData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // Build graph data from user entries for visualization
  const buildGraphFromEntries = useCallback((profs, records, rels, currUser) => {
    if (!currUser) return { nodes: [], edges: [] };
    const nodes = [];
    const edges = [];

    const toId = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '_');

    // 1. Find which profiles are active connections
    const profilesMap = {};
    profs.forEach(p => {
      profilesMap[p.id] = p;
    });

    const activeRelations = [];
    rels.forEach(rel => {
      if (rel.status === 'active') {
        if (rel.requester_id === currUser.id && rel.receiver_id in profilesMap) {
          activeRelations.push({ user: profilesMap[rel.receiver_id], type: rel.relationship_type });
        } else if (rel.receiver_id === currUser.id && rel.requester_id in profilesMap) {
          activeRelations.push({ user: profilesMap[rel.requester_id], type: rel.relationship_type });
        }
      }
    });

    // 2. Add current user node
    const currentUserProfile = profilesMap[currUser.id];
    if (currentUserProfile) {
      nodes.push({
        id: currUser.id,
        label: currentUserProfile.full_name,
        type: 'Patient',
        group: 'Self',
      });
    }

    // 3. Add active relationship user nodes and edges
    activeRelations.forEach(rel => {
      nodes.push({
        id: rel.user.id,
        label: rel.user.full_name,
        type: 'Patient',
        group: rel.type,
      });

      // Relationship edge
      edges.push({
        id: `e_${currUser.id}_${rel.user.id}`,
        source: currUser.id,
        target: rel.user.id,
        label: rel.type === 'Parent-Child'
          ? ((currentUserProfile?.age || 0) < (rel.user.age || 0) ? 'CHILD_OF' : 'PARENT_OF')
          : rel.type === 'Roommate' ? 'LIVES_WITH' : rel.type === 'Sibling-Sibling' ? 'SIBLING_OF' : 'SPOUSE_OF',
      });
    });

    // 4. Add medical records (Conditions and Medications)
    const activeUserIds = new Set([currUser.id, ...activeRelations.map(r => r.user.id)]);
    const activeRecords = records.filter(r => activeUserIds.has(r.user_id));

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

    return { nodes, edges };
  }, []);

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
        },
      };

      const res = await fetch('http://localhost:8000/api/analyze-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Backend error');
      const data = await res.json();

      // Build full graph from current state
      const fullGraph = buildGraphFromEntries(profiles, medicalRecords, relationships, user);
      setGraphData(fullGraph);
      setTraversalPath(data.traversal_path || { nodes: [], edges: [] });
      setAppState('results');
      setIsLoading(false);
      return data;
    } catch (err) {
      console.error('Analysis failed:', err);

      // Fallback: build graph locally and show it
      const fullGraph = buildGraphFromEntries(profiles, medicalRecords, relationships, user);
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
              onDataChange={() => loadAllData(user)}
            />
          ) : (
            <div className="graph-section">
              <GraphPane graphData={graphData} traversalPath={traversalPath} />
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
          />
        </div>
      </div>
    </div>
  );
}
