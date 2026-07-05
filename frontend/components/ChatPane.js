import React, { useState, useEffect, useRef } from 'react';
import { Send, Activity, Sparkles, RefreshCw, Brain, Check } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

// Urgency/severity keywords get a colour cue (e.g. in the Urgency column of a table or in
// priority markers). Matched case-sensitively so uppercase levels are highlighted but the
// same words in ordinary prose (e.g. "high probability") are left untouched.
// 4 categories: critical (red), urgent (orange), medium (yellow), low (green).
const SEVERITY_COLORS = {
  CRITICAL: '#ef4444', // critical — red
  URGENT: '#f97316',   // urgent — orange
  MEDIUM: '#eab308',   // medium — yellow
  LOW: '#22c55e',      // low — green
};

// Inline markdown: **bold**, *italic*, and coloured severity keywords.
const renderInlineMd = (text, keyPrefix = 'i') => {
  if (text == null) return null;
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|\b(?:CRITICAL|URGENT|MEDIUM|LOW)\b)/g;
  let last = 0;
  let m;
  let n = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-b${n}`} style={{ color: '#66fcf1' }}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('*')) {
      parts.push(<em key={`${keyPrefix}-i${n}`} style={{ color: '#e5e7eb' }}>{tok.slice(1, -1)}</em>);
    } else {
      parts.push(<strong key={`${keyPrefix}-s${n}`} style={{ color: SEVERITY_COLORS[tok] || '#c5c6c7' }}>{tok}</strong>);
    }
    last = regex.lastIndex;
    n += 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
};

// Render a GitHub-style pipe table (| a | b | with a |---|---| separator row).
const renderMdTable = (tableLines, key) => {
  const parseRow = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const rows = tableLines.map(parseRow);
  let header = null;
  let body = rows;
  if (rows.length >= 2 && rows[1].every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')))) {
    header = rows[0];
    body = rows.slice(2);
  }
  const cell = { border: '1px solid #2b3a4a', padding: '6px 10px', fontSize: '11px', color: '#c5c6c7', textAlign: 'left', verticalAlign: 'top', lineHeight: '1.4' };
  const th = { ...cell, color: '#66fcf1', fontWeight: 700, background: '#1f2833', whiteSpace: 'nowrap' };
  return (
    <div key={`tbl-${key}`} style={{ overflowX: 'auto', margin: '8px 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '340px' }}>
        {header && (
          <thead><tr>{header.map((h, ci) => <th key={ci} style={th}>{renderInlineMd(h, `th-${key}-${ci}`)}</th>)}</tr></thead>
        )}
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri}>{r.map((c, ci) => <td key={ci} style={cell}>{renderInlineMd(c, `td-${key}-${ri}-${ci}`)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Block-level markdown: headings (# .. ####), --- rules, pipe tables, ordered/unordered
// lists, and paragraphs, with inline bold/italic. Self-contained (no external deps).
const renderMarkdown = (text) => {
  if (!text) return null;
  const lines = text.split('\n');
  const headingStyle = {
    1: { color: '#66fcf1', margin: '16px 0 8px 0', fontSize: '17px', fontWeight: 'bold' },
    2: { color: '#66fcf1', margin: '14px 0 8px 0', fontSize: '15px', fontWeight: 'bold' },
    3: { color: '#66fcf1', margin: '12px 0 6px 0', fontSize: '14px', fontWeight: 'bold' },
    4: { color: '#e5e7eb', margin: '10px 0 6px 0', fontSize: '13px', fontWeight: '600' },
  };
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Table block: consecutive lines starting with '|'
    if (trimmed.startsWith('|')) {
      const tbl = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { tbl.push(lines[i]); i += 1; }
      blocks.push(renderMdTable(tbl, i));
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${i}`} style={{ border: 'none', borderTop: '1px solid #2b3a4a', margin: '12px 0' }} />);
      i += 1;
      continue;
    }

    // Heading (# .. ######, clamped to our 4 styles)
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length, 4);
      blocks.push(<div key={`h-${i}`} style={headingStyle[level]}>{renderInlineMd(h[2], `h-${i}`)}</div>);
      i += 1;
      continue;
    }

    // Unordered list item
    if (/^[-*]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-*]\s+/, '');
      blocks.push(<li key={`li-${i}`} style={{ marginLeft: '18px', marginBottom: '4px', listStyleType: 'square', color: '#c5c6c7', fontSize: '12px', lineHeight: '1.45' }}>{renderInlineMd(content, `li-${i}`)}</li>);
      i += 1;
      continue;
    }

    // Ordered list item
    const num = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (num) {
      blocks.push(
        <div key={`num-${i}`} style={{ display: 'flex', marginLeft: '12px', marginBottom: '6px', color: '#c5c6c7', fontSize: '12px', lineHeight: '1.45' }}>
          <span style={{ color: '#66fcf1', marginRight: '6px', fontWeight: 'bold' }}>{num[1]}.</span>
          <span>{renderInlineMd(num[2], `num-${i}`)}</span>
        </div>
      );
      i += 1;
      continue;
    }

    // Blank line -> vertical spacing
    if (trimmed === '') {
      blocks.push(<div key={`sp-${i}`} style={{ height: '8px' }} />);
      i += 1;
      continue;
    }

    // Paragraph
    blocks.push(<p key={`p-${i}`} style={{ marginBottom: '6px', lineHeight: '1.45', color: '#c5c6c7', fontSize: '12px' }}>{renderInlineMd(line, `p-${i}`)}</p>);
    i += 1;
  }
  return blocks;
};

const CONDITION_TYPES = ['Genetic', 'Autoimmune', 'Chronic', 'Symptom', 'Allergy', 'Infection'];

const NoteApprovalCard = ({ msg, msgIndex, setHistory, onDataChange, user }) => {
  const [checkedStates, setCheckedStates] = useState(
    msg.hardFacts.map(() => true)
  );
  // Editable condition_type overrides per fact
  const [conditionTypes, setConditionTypes] = useState(
    msg.hardFacts.map(f => f.metadata?.condition_type || 'Chronic')
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApproved, setIsApproved] = useState(msg.approved);

  const handleCheckboxChange = (index) => {
    setCheckedStates((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const handleConditionTypeChange = (index, value) => {
    setConditionTypes(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      const approvedFacts = msg.hardFacts.filter((_, idx) => checkedStates[idx]);
      const supabase = createClient();
      const currentUserId = user?.id;

      // Split into own-account and cross-account facts
      const ownFacts = approvedFacts.filter(f => f.resolved_id === currentUserId);
      const crossFacts = approvedFacts.filter(f => f.resolved_id !== currentUserId);

      // Insert only own-account records (RLS allows only user_id = auth.uid())
      if (ownFacts.length > 0) {
        const { error } = await supabase
          .from('medical_records')
          .insert(ownFacts.map((fact, _idx) => {
            const globalIdx = msg.hardFacts.indexOf(fact);
            const metadata = { ...(fact.metadata || {}), status: 'active' };
            if (fact.record_type === 'condition') {
              metadata.condition_type = conditionTypes[globalIdx] || 'Chronic';
            }
            return {
              user_id: fact.resolved_id,
              record_type: fact.record_type,
              name: fact.name,
              metadata,
              source_note_id: msg.noteId || null,
            };
          }));

        if (error) throw error;
      }

      // Cross-account facts: store as additional semantic facts (not medical_records)
      if (crossFacts.length > 0) {
        const crossFactTexts = crossFacts.map(f => {
          const typeLabel = f.metadata?.condition_type || conditionTypes[msg.hardFacts.indexOf(f)] || '';
          return `${f.patient_name} has ${typeLabel ? typeLabel + ' ' : ''}${f.record_type}: ${f.name}`;
        });
        if (msg.noteId) {
          const { error: factsErr } = await supabase
            .from('semantic_facts')
            .insert(crossFactTexts.map(ft => ({
              note_id: msg.noteId,
              patient_id: currentUserId,
              fact_text: ft,
            })));
          if (factsErr) console.error('Failed to save cross-account semantic facts:', factsErr);
        }
      }

      // Incrementally add facts to Cognee graph
      if (msg.noteId && msg.semanticFacts && msg.semanticFacts.length > 0) {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
          await fetch(`${apiUrl}/api/graph/add-facts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: currentUserId,
              note_id: msg.noteId,
              facts: msg.semanticFacts,
            }),
          });
        } catch (graphErr) {
          console.error('Cognee incremental add failed (non-fatal):', graphErr);
        }
      }

      setIsApproved(true);
      
      // Update history state so the card renders as "Approved"
      setHistory(prev => {
        const next = [...prev];
        next[msgIndex] = { ...next[msgIndex], approved: true };
        return next;
      });

      if (onDataChange) onDataChange();
    } catch (err) {
      console.error("Failed to approve facts:", err);
      alert("Failed to save approved records to Supabase.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="chat-msg note-approval-card" style={{
      background: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid #1e293b',
      borderRadius: '8px',
      padding: '14px',
      margin: '10px 0',
      width: '100%',
      maxWidth: '380px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Brain size={16} style={{ color: '#66fcf1' }} />
        <span style={{ fontWeight: 700, fontSize: '11px', color: '#66fcf1', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          Clinical Note Ingested
        </span>
      </div>
      <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 10px 0', fontStyle: 'italic', borderLeft: '2px solid #4b5563', paddingLeft: '8px', lineHeight: '1.4' }}>
        "{msg.summary}"
      </p>

      {isApproved ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#4ade80', fontSize: '12px', fontWeight: 600 }}>
          <Check size={14} /> Approved & Added to Profile
        </div>
      ) : msg.hardFacts.length === 0 ? (
        <div>
          <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 8px 0' }}>
            No structured hard facts extracted (saved as semantic facts only).
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#4ade80', fontSize: '12px', fontWeight: 600 }}>
            <Check size={14} /> Ingested successfully
          </div>
        </div>
      ) : (
        <div>
          <span style={{ fontSize: '9px', color: '#9ca3af', display: 'block', marginBottom: '6px', fontWeight: 700, letterSpacing: '0.5px' }}>
            SUGGESTED PROFILE UPDATES:
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
            {msg.hardFacts.map((fact, idx) => {
              const isOwnRecord = fact.resolved_id === user?.id;
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: '#fff' }}>
                  <input 
                    type="checkbox" 
                    checked={checkedStates[idx]} 
                    onChange={() => handleCheckboxChange(idx)}
                    style={{ marginTop: '3px', cursor: 'pointer' }}
                  />
                  <div style={{ lineHeight: '1.3', flex: 1 }}>
                    <div>
                      <strong>{fact.patient_name}</strong>: {fact.name} <span style={{ color: '#9ca3af', fontSize: '10px' }}>({fact.record_type})</span>
                      {!isOwnRecord && (
                        <span style={{ color: '#f59e0b', fontSize: '9px', marginLeft: '4px' }}>⚡ semantic only</span>
                      )}
                    </div>
                    {fact.record_type === 'condition' && (
                      <select
                        value={conditionTypes[idx]}
                        onChange={(e) => handleConditionTypeChange(idx, e.target.value)}
                        style={{
                          marginTop: '4px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '3px',
                          color: '#e2e8f0',
                          fontSize: '10px',
                          padding: '2px 6px',
                          cursor: 'pointer',
                        }}
                      >
                        {CONDITION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <button 
            onClick={handleApprove}
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '6px 12px',
              background: '#0d1117',
              border: '1px solid #66fcf1',
              borderRadius: '4px',
              color: '#66fcf1',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 0 10px rgba(102, 252, 241, 0.1)'
            }}
          >
            {isSubmitting ? 'Saving...' : 'Approve & Update Profile'}
          </button>
        </div>
      )}
    </div>
  );
};

const COMMANDS = [
  {
    name: '@add_clinical_note',
    description: 'Ingest a clinical note & auto-extract patient facts',
    template: '@add_clinical_note Dr. Abhishek | ',
    icon: '📥'
  },
  {
    name: '@remove_clinical_note',
    description: 'Delete a clinical note & prune its Cognee memory',
    template: '@remove_clinical_note ',
    icon: '🗑️'
  }
];

const ChatPane = ({ onAnalyze, isLoading, profiles = [], medicalRecords = [], relationships = [], appState, user, isGraphBuilt, isBuildingGraph, onBuildGraph, onDataChange }) => {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([]);
  const messagesEndRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState('');
  const [selectedCmdIdx, setSelectedCmdIdx] = useState(0);

  const queryLower = query.toLowerCase();
  const isAtStart = query.startsWith('@');
  const matchingCmds = isAtStart 
    ? COMMANDS.filter(cmd => cmd.name.toLowerCase().startsWith(queryLower.split(' ')[0]))
    : [];
  const showDropdown = isAtStart && matchingCmds.length > 0;

  // Simulate progress steps for Cognee graph synthesis
  useEffect(() => {
    let interval;
    if (isBuildingGraph) {
      setProgress(5);
      setLoadingStep('Clearing previous session cache...');
      
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 95) {
            clearInterval(interval);
            return 95;
          }
          const nextVal = prev + Math.floor(Math.random() * 8) + 2;
          
          if (nextVal < 25) {
            setLoadingStep('Clearing previous session cache...');
          } else if (nextVal < 60) {
            setLoadingStep('Ingesting Supabase patient records...');
          } else if (nextVal < 85) {
            setLoadingStep('Running Cognee graph reasoning engine...');
          } else {
            setLoadingStep('Synthesizing semantic nodes and edges...');
          }
          
          return nextVal > 95 ? 95 : nextVal;
        });
      }, 600);
    } else {
      setProgress(0);
      setLoadingStep('');
    }
    return () => clearInterval(interval);
  }, [isBuildingGraph]);

  // Build dynamic suggestion chips from user's data
  const suggestions = React.useMemo(() => {
    const chips = [];
    if (!user) return chips;

    const myProfile = profiles.find(p => p.id === user.id);
    const myName = myProfile ? myProfile.full_name : 'me';

    const myRecords = medicalRecords.filter(r => r.user_id === user.id);
    const meds = myRecords.filter(r => r.record_type === 'medication');
    const conditions = myRecords.filter(r => r.record_type === 'condition');

    // Scenario 1: Pharmacogenomics (default profiles)
    if (meds.some(m => m.name.toLowerCase().includes('codeine')) || myName.toLowerCase() === 'abhishek') {
      chips.push({
        icon: '💊',
        text: `Is codeine safe for ${myName}?`,
      });
    }
    // Scenario 2: Autoimmune
    if (conditions.some(c => c.name.toLowerCase().includes('joint')) || myName.toLowerCase() === 'mamata') {
      chips.push({
        icon: '🦴',
        text: `what are the hereditary risks for mamata`,
      });
    }
    // Scenario 3: Environmental
    if (myName.toLowerCase() === 'marcus' || conditions.some(c => c.name.toLowerCase().includes('respiratory'))) {
      chips.push({
        icon: '🏡',
        text: `Why is Marcus Vance coughing?`,
      });
    }

    return chips;
  }, [profiles, medicalRecords, relationships, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isLoading]);

  const handleAddNoteCommand = async (text) => {
    const commandContent = text.substring(19).trim();
    let author = 'Dr. Abhishek';
    let noteText = commandContent;
    
    if (commandContent.includes('|')) {
      const parts = commandContent.split('|');
      author = parts[0].trim();
      noteText = parts.slice(1).join('|').trim();
    }
    
    const loaderMsgId = `loader-${Date.now()}`;
    setHistory(prev => [...prev, { id: loaderMsgId, sender: 'system', text: 'Parsing note clinical details with Cognee...' }]);
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/notes/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_text: noteText,
          patient_id: user.id,
          profiles: profiles.map(p => ({ id: p.id, full_name: p.full_name }))
        })
      });
      
      if (!res.ok) throw new Error('API parse failed');
      const data = await res.json();
      
      const supabase = createClient();
      const { data: noteData, error: noteErr } = await supabase
        .from('clinical_notes')
        .insert({
          patient_id: user.id,
          author_name: author,
          note_text: noteText,
          summary: data.summary || 'Clinical note summary'
        })
        .select()
        .single();
        
      if (noteErr) throw noteErr;
      
      if (data.semantic_facts && data.semantic_facts.length > 0) {
        const factInserts = data.semantic_facts.map(fact => ({
          note_id: noteData.id,
          patient_id: user.id,
          fact_text: fact
        }));
        
        const { error: factsErr } = await supabase
          .from('semantic_facts')
          .insert(factInserts);
          
        if (factsErr) throw factsErr;
      }
      
      setHistory(prev => {
        const filtered = prev.filter(m => m.id !== loaderMsgId);
        return [
          ...filtered,
          {
            sender: 'system',
            type: 'note-approval',
            noteId: noteData.id,
            noteText: noteText,
            summary: data.summary,
            hardFacts: data.hard_facts || [],
            semanticFacts: data.semantic_facts || [],
            approved: false
          }
        ];
      });
      
      if (onDataChange) onDataChange();
    } catch (err) {
      console.error(err);
      setHistory(prev => {
        const filtered = prev.filter(m => m.id !== loaderMsgId);
        return [...filtered, { sender: 'system', text: '⚠️ Failed to parse note clinical details. Ensure the backend is active.' }];
      });
    }
  };

  const handleRemoveNoteCommand = async (text) => {
    const noteIdStr = text.substring(22).trim();
    const noteId = parseInt(noteIdStr, 10);
    
    if (isNaN(noteId)) {
      setHistory(prev => [...prev, { sender: 'system', text: '⚠️ Invalid Note ID. Usage: @remove_clinical_note [ID]' }]);
      return;
    }
    
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('clinical_notes')
        .delete()
        .eq('id', noteId);
        
      if (error) throw error;

      // Surgically remove this note's dataset from Cognee
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        await fetch(`${apiUrl}/api/graph/remove-note`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id, note_id: noteId }),
        });
      } catch (graphErr) {
        console.error('Cognee prune failed (non-fatal):', graphErr);
      }
      
      setHistory(prev => [...prev, { sender: 'system', text: `✅ Clinical Note ID ${noteId} deleted. Associated records and Cognee memory pruned.` }]);
      // Incremental update only: the note's medical_records/semantic_facts are cascade-
      // deleted in Supabase and its Cognee dataset was scoped-removed server-side
      // (/api/graph/remove-note). Rebuilding the visual graph from the refreshed data is
      // enough — no need to prune + re-cognify the whole graph via onBuildGraph().
      if (onDataChange) {
        await onDataChange();
      }
    } catch (err) {
      console.error(err);
      setHistory(prev => [...prev, { sender: 'system', text: `⚠️ Failed to delete Clinical Note ID ${noteId}.` }]);
    }
  };

  const handleSubmit = async (textToSend) => {
    const activeText = textToSend || query;
    if (!activeText.trim() || isLoading) return;

    setHistory(prev => [...prev, { sender: 'user', text: activeText }]);
    setQuery('');

    if (activeText.startsWith('@add_clinical_note ')) {
      await handleAddNoteCommand(activeText);
      return;
    }
    
    if (activeText.startsWith('@remove_clinical_note ')) {
      await handleRemoveNoteCommand(activeText);
      return;
    }

    const result = await onAnalyze(activeText);

    if (result && result.warning) {
      setHistory(prev => [
        ...prev,
        {
          sender: 'ai',
          text: result.warning,
          scenario: result.scenario_description,
        },
      ]);
    } else {
      setHistory(prev => [
        ...prev,
        { sender: 'ai', text: '### ⚠️ Error\nUnable to retrieve analysis. Ensure the backend is running.' },
      ]);
    }
  };

  const handleKeyPress = (e) => {
    if (showDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCmdIdx(prev => (prev + 1) % matchingCmds.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCmdIdx(prev => (prev - 1 + matchingCmds.length) % matchingCmds.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selectedCmd = matchingCmds[selectedCmdIdx];
        if (selectedCmd) {
          setQuery(selectedCmd.template);
          setSelectedCmdIdx(0);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setQuery('');
        return;
      }
    }
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="chat-pane-container">
      {/* Header */}
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity style={{ color: '#ef4444' }} className="pulse-icon" size={18} />
          <h2 className="chat-title">CLINICAL RISK ANALYSIS</h2>
        </div>
        <div className="chat-badge">
          <Sparkles size={12} />
          Cognee
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {history.length === 0 && (
          <div className="chat-welcome">
            <h3>Welcome to MedTree</h3>
            <p>
              {appState === 'entry'
                ? 'Add your medical data in the left panel, then type a query below to trigger multi-hop risk analysis.'
                : 'Your medical graph is active. Type another query to analyze different risks.'}
            </p>
          </div>
        )}

        {history.map((msg, i) => {
          const isUser = msg.sender === 'user';
          const isAi = msg.sender === 'ai';
          const isSystem = msg.sender === 'system';

          if (isSystem) {
            if (msg.type === 'note-approval') {
              return (
                <NoteApprovalCard
                  key={i}
                  msg={msg}
                  msgIndex={i}
                  setHistory={setHistory}
                  onDataChange={onDataChange}
                  user={user}
                />
              );
            }
            return (
              <div key={i} className="chat-msg" style={{ background: '#1e293b', border: '1px dashed #334155', color: '#9ca3af', fontSize: '11px', padding: '6px 12px', margin: '4px 0', borderRadius: '4px' }}>
                <div>{msg.text}</div>
              </div>
            );
          }

          if (isUser && (msg.text.startsWith('@add_clinical_note') || msg.text.startsWith('@remove_clinical_note'))) {
            const firstSpace = msg.text.indexOf(' ');
            const cmdName = firstSpace > -1 ? msg.text.substring(0, firstSpace) : msg.text;
            const cmdArgs = firstSpace > -1 ? msg.text.substring(firstSpace + 1) : '';
            return (
              <div key={i} className="chat-msg chat-msg-user" style={{
                background: 'rgba(15, 23, 42, 0.85)',
                borderColor: '#66fcf1',
                color: '#fff',
                fontSize: '12px',
                fontFamily: 'monospace',
                padding: '10px 14px',
                borderRadius: '8px',
                maxWidth: '85%',
                boxShadow: '0 0 15px rgba(102, 252, 241, 0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#66fcf1', fontWeight: 'bold', marginBottom: '6px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  <span>💻 Terminal Command</span>
                </div>
                <span style={{ color: '#66fcf1', fontWeight: 'bold' }}>
                  {cmdName}
                </span>{' '}
                <span style={{ color: '#e2e8f0' }}>
                  {cmdArgs}
                </span>
              </div>
            );
          }

          return (
            <div
              key={i}
              className={`chat-msg ${isUser ? 'chat-msg-user' : 'chat-msg-ai'}`}
            >
              {isAi && msg.text && msg.text.includes('ALERT') && <div className="chat-msg-alert-bar" />}
              <div>{renderMarkdown(msg.text)}</div>
              {isAi && msg.scenario && (
                <div className="chat-msg-scenario">
                  <RefreshCw size={11} />
                  <span>{msg.scenario}</span>
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="chat-msg chat-msg-ai" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#38bdf8' }}>
            <RefreshCw className="animate-spin" size={16} />
            <span>Traversing graph memory & analyzing risks...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Dynamic Suggestions */}
      {suggestions.length > 0 && history.length === 0 && (
        <div className="chat-suggestions">
          <div className="chat-suggestions-label">SUGGESTED QUERIES:</div>
          <div className="chat-suggestions-list">
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="chat-suggestion-chip"
                onClick={() => handleSubmit(s.text)}
                disabled={isLoading}
              >
                <span>{s.icon}</span> {s.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="chat-input-area" style={{ position: 'relative' }}>
        {showDropdown && (
          <div className="command-palette-dropdown" style={{
            position: 'absolute',
            bottom: '60px',
            left: '10px',
            right: '10px',
            background: 'rgba(13, 17, 23, 0.98)',
            border: '1px solid #334155',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(102, 252, 241, 0.1)',
            zIndex: 1000,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            padding: '4px'
          }}>
            <div style={{
              fontSize: '9px',
              fontWeight: 700,
              color: '#66fcf1',
              padding: '6px 10px',
              borderBottom: '1px solid #1e293b',
              letterSpacing: '0.8px',
              textTransform: 'uppercase'
            }}>
              Available Note Commands
            </div>
            {matchingCmds.map((cmd, idx) => {
              const isSelected = idx === selectedCmdIdx;
              return (
                <div
                  key={cmd.name}
                  onClick={() => {
                    setQuery(cmd.template);
                    setSelectedCmdIdx(0);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(102, 252, 241, 0.15)' : 'transparent',
                    borderLeft: isSelected ? '3px solid #66fcf1' : '3px solid transparent',
                    transition: 'all 0.15s'
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{cmd.icon}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: isSelected ? '#66fcf1' : '#f3f4f6' }}>{cmd.name}</span>
                    <span style={{ fontSize: '9px', color: '#9ca3af' }}>{cmd.description}</span>
                  </div>
                  <span style={{ fontSize: '9px', color: '#4b5563', fontStyle: 'italic' }}>
                    {isSelected ? 'press Enter to insert' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="chat-input-row">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedCmdIdx(0);
            }}
            onKeyDown={handleKeyPress}
            placeholder="Describe a symptom, medication, or clinical question..."
            disabled={isLoading}
            className="chat-input"
          />
          <button
            onClick={() => handleSubmit()}
            disabled={isLoading || !query.trim()}
            className="chat-send-btn"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Glassmorphic lock screen overlay when graph has not been synthesized */}
      {!isGraphBuilt && (
        <div className="chat-lock-overlay">
          {isBuildingGraph ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '280px' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', background: '#0d1117', border: '2px solid #2b3a4a', marginBottom: '14px' }}>
                <Brain size={32} className="pulse-icon" style={{ color: '#66fcf1' }} />
              </div>
              <h3 style={{ fontWeight: 700, fontSize: '15px', margin: '0 0 4px 0', color: '#fff' }}>Synthesizing Graph...</h3>
              
              {/* Progress bar */}
              <div style={{ width: '100%', height: '6px', backgroundColor: '#1f2833', borderRadius: '3px', overflow: 'hidden', margin: '10px 0 8px 0' }}>
                <div style={{ width: `${progress}%`, height: '100%', backgroundColor: '#66fcf1', transition: 'width 0.4s ease' }} />
              </div>
              
              <p style={{ fontSize: '11px', color: '#9ca3af', minHeight: '16px', margin: 0, textAlign: 'center' }}>
                {loadingStep} ({progress}%)
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <button 
                onClick={onBuildGraph}
                className="circular-build-btn"
                title="Generate Medical Tree"
              >
                <Brain size={32} style={{ color: '#66fcf1' }} />
              </button>
              <span style={{ fontSize: '11px', color: '#66fcf1', fontWeight: 700, marginTop: '10px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                Generate Medical Tree
              </span>
              <h3 style={{ fontWeight: 700, fontSize: '15px', margin: '14px 0 6px 0', color: '#fff' }}>Clinical Reasoning Offline</h3>
              <p style={{ fontSize: '12px', color: '#9ca3af', maxWidth: '300px', lineHeight: '1.5', margin: 0, padding: '0 20px', textAlign: 'center' }}>
                Click the brain icon above to compile your family network into Cognee's semantic memory.
              </p>
            </div>
          )}
        </div>
      )}

      <style jsx global>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
        .pulse-icon { animation: pulse 2s infinite ease-in-out; }
        .animate-spin { animation: spin 1.2s infinite linear; }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ChatPane;
