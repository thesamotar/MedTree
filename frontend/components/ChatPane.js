import React, { useState, useEffect, useRef } from 'react';
import { Send, Activity, Sparkles, RefreshCw, Brain } from 'lucide-react';

// Simple lightweight markdown renderer
const renderMarkdown = (text) => {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, index) => {
    if (line.startsWith('### ')) {
      return <h3 key={index} style={{ color: '#66fcf1', margin: '14px 0 8px 0', fontSize: '15px', fontWeight: 'bold' }}>{line.replace('### ', '')}</h3>;
    }
    if (line.startsWith('#### ')) {
      return <h4 key={index} style={{ color: '#e5e7eb', margin: '10px 0 6px 0', fontSize: '13px', fontWeight: '600' }}>{line.replace('#### ', '')}</h4>;
    }
    let content = line;
    const boldRegex = /\*\*(.*?)\*\*/g;
    let match;
    const elements = [];
    let lastIndex = 0;
    while ((match = boldRegex.exec(line)) !== null) {
      if (match.index > lastIndex) elements.push(line.substring(lastIndex, match.index));
      elements.push(<strong key={match.index} style={{ color: '#66fcf1' }}>{match[1]}</strong>);
      lastIndex = boldRegex.lastIndex;
    }
    if (lastIndex < line.length) elements.push(line.substring(lastIndex));
    const renderedLine = elements.length > 0 ? elements : content;

    if (line.startsWith('- ')) {
      return <li key={index} style={{ marginLeft: '16px', marginBottom: '4px', listStyleType: 'square', color: '#c5c6c7' }}>{typeof renderedLine === 'string' ? renderedLine.substring(2) : renderedLine}</li>;
    }
    const numMatch = line.match(/^(\d+)\.\s(.*)/);
    if (numMatch) {
      return <div key={index} style={{ display: 'flex', marginLeft: '12px', marginBottom: '6px', color: '#c5c6c7' }}><span style={{ color: '#66fcf1', marginRight: '6px', fontWeight: 'bold' }}>{numMatch[1]}.</span><span>{numMatch[2]}</span></div>;
    }
    if (line.trim() === '') return <div key={index} style={{ height: '8px' }} />;
    return <p key={index} style={{ marginBottom: '6px', lineHeight: '1.4', color: '#c5c6c7' }}>{renderedLine}</p>;
  });
};

const ChatPane = ({ onAnalyze, isLoading, profiles = [], medicalRecords = [], relationships = [], appState, user, isGraphBuilt, isBuildingGraph, onBuildGraph }) => {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([]);
  const messagesEndRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState('');

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

    meds.forEach(m => {
      chips.push({
        text: `Is ${m.name} safe for ${myName}?`,
        icon: '💊',
      });
    });
    conditions.filter(c => c.metadata?.condition_type === 'Symptom').forEach(c => {
      chips.push({
        text: `${myName} reports ${c.name}`,
        icon: '🩺',
      });
    });
    // If there are people with active parent-child relationships, suggest hereditary check
    const hasParent = relationships.some(r => r.status === 'active' && r.relationship_type === 'Parent-Child');
    if (hasParent) {
      chips.push({
        text: `Check hereditary risks for ${myName}`,
        icon: '🧬',
      });
    }
    return chips.slice(0, 4); // max 4 suggestions
  }, [profiles, medicalRecords, relationships, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isLoading]);

  const handleSubmit = async (textToSend) => {
    const activeText = textToSend || query;
    if (!activeText.trim() || isLoading) return;

    setHistory(prev => [...prev, { sender: 'user', text: activeText }]);
    setQuery('');

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
          Cognee + AI
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

          return (
            <div
              key={i}
              className={`chat-msg ${isUser ? 'chat-msg-user' : 'chat-msg-ai'}`}
            >
              {isAi && msg.text.includes('ALERT') && <div className="chat-msg-alert-bar" />}
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
      <div className="chat-input-area">
        <div className="chat-input-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
