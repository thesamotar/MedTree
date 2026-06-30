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

  // Data
  const [entries, setEntries] = useState([]);
  const [traversalPath, setTraversalPath] = useState({ nodes: [], edges: [] });
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [isLoading, setIsLoading] = useState(false);

  // Check auth on mount
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);
      setAuthLoading(false);

      // Load user's medical entries from Supabase
      const { data, error } = await supabase
        .from('medical_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (data) {
        setEntries(data);
      }
    };
    checkUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // Build graph data from user entries for visualization
  const buildGraphFromEntries = useCallback((userEntries) => {
    const nodes = [];
    const edges = [];
    const people = userEntries.filter(e => e.entry_type === 'person');
    const conditions = userEntries.filter(e => e.entry_type === 'condition');
    const medications = userEntries.filter(e => e.entry_type === 'medication');
    const locations = userEntries.filter(e => e.entry_type === 'location');

    const toId = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Add person nodes
    people.forEach(p => {
      nodes.push({
        id: toId(p.data.name),
        label: p.data.name,
        type: 'Patient',
        group: p.data.relationship,
      });
    });

    // Add relationship edges between people
    const selfPeople = people.filter(p => p.data.relationship === 'Self');
    people.forEach(p => {
      if (p.data.relationship === 'Parent' && selfPeople.length > 0) {
        edges.push({
          id: `e_${toId(selfPeople[0].data.name)}_${toId(p.data.name)}`,
          source: toId(selfPeople[0].data.name),
          target: toId(p.data.name),
          label: 'CHILD_OF',
        });
      } else if (p.data.relationship === 'Child' && selfPeople.length > 0) {
        edges.push({
          id: `e_${toId(p.data.name)}_${toId(selfPeople[0].data.name)}`,
          source: toId(p.data.name),
          target: toId(selfPeople[0].data.name),
          label: 'CHILD_OF',
        });
      } else if (p.data.relationship === 'Sibling' && selfPeople.length > 0) {
        edges.push({
          id: `e_${toId(selfPeople[0].data.name)}_${toId(p.data.name)}`,
          source: toId(selfPeople[0].data.name),
          target: toId(p.data.name),
          label: 'SIBLING_OF',
        });
      } else if (p.data.relationship === 'Spouse' && selfPeople.length > 0) {
        edges.push({
          id: `e_${toId(selfPeople[0].data.name)}_${toId(p.data.name)}`,
          source: toId(selfPeople[0].data.name),
          target: toId(p.data.name),
          label: 'SPOUSE_OF',
        });
      }
    });

    // Add condition nodes and edges
    conditions.forEach(c => {
      const condId = toId(c.data.condition_name);
      if (!nodes.find(n => n.id === condId)) {
        const typeMap = {
          'Genetic': 'GeneticCondition',
          'Autoimmune': 'AutoimmuneCondition',
          'Symptom': 'Symptom',
          'Allergy': 'Risk',
          'Chronic': 'AutoimmuneCondition',
        };
        nodes.push({
          id: condId,
          label: c.data.condition_name,
          type: typeMap[c.data.condition_type] || 'AutoimmuneCondition',
          group: c.data.condition_type,
        });
      }
      const personId = toId(c.data.person_name);
      edges.push({
        id: `e_${personId}_${condId}`,
        source: personId,
        target: condId,
        label: 'HAS_CONDITION',
      });
    });

    // Add medication nodes and edges
    medications.forEach(m => {
      const medId = toId(m.data.drug_name);
      if (!nodes.find(n => n.id === medId)) {
        nodes.push({
          id: medId,
          label: m.data.drug_name,
          type: 'Medication',
          group: 'medication',
        });
      }
      const personId = toId(m.data.person_name);
      edges.push({
        id: `e_${personId}_${medId}`,
        source: personId,
        target: medId,
        label: m.data.status === 'Proposed' ? 'PRESCRIBED' : 'TAKES',
      });
    });

    // Add location nodes and edges
    locations.forEach(l => {
      const locId = toId(l.data.location_name);
      if (!nodes.find(n => n.id === locId)) {
        nodes.push({
          id: locId,
          label: l.data.location_name,
          type: 'Location',
          group: 'location',
        });
      }
      (l.data.residents || []).forEach(residentName => {
        const resId = toId(residentName);
        if (nodes.find(n => n.id === resId)) {
          edges.push({
            id: `e_${resId}_${locId}`,
            source: resId,
            target: locId,
            label: 'LIVES_AT',
          });
        }
      });
      // Add LIVES_WITH edges between residents
      const residents = l.data.residents || [];
      for (let i = 0; i < residents.length; i++) {
        for (let j = i + 1; j < residents.length; j++) {
          const id1 = toId(residents[i]);
          const id2 = toId(residents[j]);
          if (nodes.find(n => n.id === id1) && nodes.find(n => n.id === id2)) {
            edges.push({
              id: `e_lw_${id1}_${id2}`,
              source: id1,
              target: id2,
              label: 'LIVES_WITH',
            });
          }
        }
      }
    });

    return { nodes, edges };
  }, []);

  // Analyze query
  const handleAnalyze = async (queryText) => {
    setIsLoading(true);
    try {
      // Prepare user data payload for the backend
      const payload = {
        query: queryText,
        user_data: {
          people: entries.filter(e => e.entry_type === 'person').map(e => e.data),
          conditions: entries.filter(e => e.entry_type === 'condition').map(e => e.data),
          medications: entries.filter(e => e.entry_type === 'medication').map(e => e.data),
          locations: entries.filter(e => e.entry_type === 'location').map(e => e.data),
        },
      };

      const res = await fetch('http://localhost:8000/api/analyze-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Backend error');
      const data = await res.json();

      // Build full graph from user data
      const fullGraph = buildGraphFromEntries(entries);
      setGraphData(fullGraph);
      setTraversalPath(data.traversal_path || { nodes: [], edges: [] });
      setAppState('results');
      setIsLoading(false);
      return data;
    } catch (err) {
      console.error('Analysis failed:', err);

      // Fallback: build graph locally and show it
      const fullGraph = buildGraphFromEntries(entries);
      setGraphData(fullGraph);
      // Highlight all nodes/edges as a fallback
      setTraversalPath({
        nodes: fullGraph.nodes.map(n => n.id),
        edges: fullGraph.edges.map(e => e.id),
      });
      setAppState('results');
      setIsLoading(false);

      return {
        warning: `### ℹ️ Offline Analysis\n\nThe backend is not running. Showing your full medical graph. Connect the FastAPI backend for AI-powered risk analysis.\n\n**Your query:** ${queryText}`,
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
              entries={entries}
              setEntries={setEntries}
              onDataChange={() => {}}
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
            entries={entries}
            appState={appState}
          />
        </div>
      </div>
    </div>
  );
}
