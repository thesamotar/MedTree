import React, { useState } from 'react';
import { Send, Activity, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react';

// Simple lightweight custom markdown renderer to render Claude outputs safely without external packages
const renderMarkdown = (text) => {
  if (!text) return null;
  
  const lines = text.split('\n');
  return lines.map((line, index) => {
    // Headers
    if (line.startsWith('### ')) {
      return <h3 key={index} style={{ color: '#66fcf1', margin: '14px 0 8px 0', fontSize: '15px', fontWeight: 'bold' }}>{line.replace('### ', '')}</h3>;
    }
    if (line.startsWith('#### ')) {
      return <h4 key={index} style={{ color: '#e5e7eb', margin: '10px 0 6px 0', fontSize: '13px', fontWeight: '600' }}>{line.replace('#### ', '')}</h4>;
    }
    
    // Bold highlights
    let content = line;
    const boldRegex = /\*\*(.*?)\*\*/g;
    let match;
    const elements = [];
    let lastIndex = 0;
    
    while ((match = boldRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        elements.push(line.substring(lastIndex, match.index));
      }
      elements.push(<strong key={match.index} style={{ color: '#66fcf1' }}>{match[1]}</strong>);
      lastIndex = boldRegex.lastIndex;
    }
    if (lastIndex < line.length) {
      elements.push(line.substring(lastIndex));
    }

    const renderedLine = elements.length > 0 ? elements : content;

    // Bullet points
    if (line.startsWith('- ')) {
      return (
        <li key={index} style={{ marginLeft: '16px', marginBottom: '4px', listStyleType: 'square', color: '#c5c6c7' }}>
          {typeof renderedLine === 'string' ? renderedLine.substring(2) : renderedLine}
        </li>
      );
    }
    
    // Numbered lists
    const numMatch = line.match(/^(\d+)\.\s(.*)/);
    if (numMatch) {
      return (
        <div key={index} style={{ display: 'flex', marginLeft: '12px', marginBottom: '6px', color: '#c5c6c7' }}>
          <span style={{ color: '#66fcf1', marginRight: '6px', fontWeight: 'bold' }}>{numMatch[1]}.</span>
          <span>{numMatch[2]}</span>
        </div>
      );
    }
    
    // Empty lines
    if (line.trim() === '') {
      return <div key={index} style={{ height: '8px' }} />;
    }

    // Default text
    return <p key={index} style={{ marginBottom: '6px', lineHeight: '1.4', color: '#c5c6c7' }}>{renderedLine}</p>;
  });
};

const ChatPane = ({ onAnalyze, isLoading, currentScenario }) => {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([
    {
      sender: 'system',
      text: '### Welcome to MedTree\nUse this portal to run emergency multi-hop risk analysis. Type a query or click one of the pre-seeded demonstration scenarios below to traverse Cognee graph memory and prompt Claude 3.5.',
    },
  ]);

  const handleSubmit = async (textToSend) => {
    const activeText = textToSend || query;
    if (!activeText.trim() || isLoading) return;

    // Add user query to chat history
    setHistory((prev) => [...prev, { sender: 'user', text: activeText }]);
    setQuery('');

    // Trigger parent analysis
    const result = await onAnalyze(activeText);

    if (result && result.warning) {
      setHistory((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: result.warning,
          context: result.cognee_context,
          scenario: result.scenario_description,
        },
      ]);
    } else {
      setHistory((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: '### ⚠️ System Timeout / Error\nUnable to retrieve analysis from backend. Ensure your FastAPI server is running on `http://localhost:8000`.',
        },
      ]);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const loadPreset = (scenarioText) => {
    handleSubmit(scenarioText);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#0d0f14',
      borderLeft: '1px solid #2b3a4a',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #2b3a4a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#090a0e',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity style={{ color: '#ef4444' }} className="pulse-icon" />
          <h2 style={{ fontSize: '15px', fontWeight: 'bold', color: '#fff', letterSpacing: '0.5px' }}>
            CLINICAL RISK ALERT & CHAT
          </h2>
        </div>
        <div style={{
          fontSize: '11px',
          backgroundColor: '#1e293b',
          color: '#38bdf8',
          padding: '4px 8px',
          borderRadius: '4px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <Sparkles size={12} />
          Cognee + Claude 3.5
        </div>
      </div>

      {/* Message History & Seeding controls */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        {history.map((msg, i) => {
          const isUser = msg.sender === 'user';
          const isSystem = msg.sender === 'system';
          const isAi = msg.sender === 'ai';

          return (
            <div
              key={i}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
                width: isSystem ? '100%' : 'auto',
                backgroundColor: isUser ? '#1e293b' : isSystem ? 'transparent' : '#151a22',
                border: isUser ? '1px solid #334155' : isSystem ? 'none' : '1px solid #2b3a4a',
                borderRadius: '8px',
                padding: isSystem ? '0' : '14px 18px',
                boxShadow: isSystem ? 'none' : '0 4px 10px rgba(0,0,0,0.2)',
                position: 'relative',
              }}
            >
              {/* Alert status border for AI Warnings */}
              {isAi && msg.text.includes('ALERT') && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: '4px',
                  backgroundColor: msg.text.includes('CRITICAL') ? '#ef4444' : '#f97316',
                  borderRadius: '8px 0 0 8px',
                }} />
              )}

              {/* Message Content */}
              <div>{renderMarkdown(msg.text)}</div>

              {/* Extra Graph Trace Context for AI outputs */}
              {isAi && msg.scenario && (
                <div style={{
                  marginTop: '12px',
                  paddingTop: '8px',
                  borderTop: '1px solid #233142',
                  fontSize: '11px',
                  color: '#38bdf8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}>
                  <RefreshCw size={11} className="spin-icon" />
                  <span>{msg.scenario}</span>
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div style={{
            alignSelf: 'flex-start',
            backgroundColor: '#151a22',
            border: '1px solid #2b3a4a',
            borderRadius: '8px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#38bdf8',
            fontSize: '13px',
          }}>
            <RefreshCw className="animate-spin" size={16} />
            <span>Traversing graph memory & analyzing risks...</span>
          </div>
        )}
      </div>

      {/* Preset Demo Prompts */}
      <div style={{
        padding: '0 20px 10px 20px',
        backgroundColor: '#0d0f14',
      }}>
        <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px', fontWeight: 600 }}>
          CLICK TO TRIGGER DEMO SCENARIOS:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button
            onClick={() => loadPreset('Prescribe Codeine for Alex Jensen')}
            disabled={isLoading}
            style={{
              textAlign: 'left',
              padding: '8px 12px',
              backgroundColor: '#15202b',
              border: '1px solid #2b3a4a',
              borderRadius: '6px',
              color: '#60a5fa',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1e2e3d'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#15202b'}
          >
            <span>💊 Pharmacogenomics: Codeine for Alex Jensen</span>
            <span style={{ fontSize: '10px', opacity: 0.7 }}>Genetic Edge</span>
          </button>
          
          <button
            onClick={() => loadPreset('Lily Chen reports stiff joints')}
            disabled={isLoading}
            style={{
              textAlign: 'left',
              padding: '8px 12px',
              backgroundColor: '#1c1622',
              border: '1px solid #3c234d',
              borderRadius: '6px',
              color: '#fb7185',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2c1f38'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1c1622'}
          >
            <span>🦴 Autoimmune: Lily Chen stiff joints</span>
            <span style={{ fontSize: '10px', opacity: 0.7 }}>Hereditary Edge</span>
          </button>
          
          <button
            onClick={() => loadPreset('Marcus Vance reports coughing and respiratory issues')}
            disabled={isLoading}
            style={{
              textAlign: 'left',
              padding: '8px 12px',
              backgroundColor: '#16221c',
              border: '1px solid #234d31',
              borderRadius: '6px',
              color: '#34d399',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1f382a'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#16221c'}
          >
            <span>🏠 Environmental: Marcus Vance respiratory distress</span>
            <span style={{ fontSize: '10px', opacity: 0.7 }}>Proximity Edge</span>
          </button>
        </div>
      </div>

      {/* Input Panel */}
      <div style={{
        padding: '16px 20px 20px 20px',
        borderTop: '1px solid #2b3a4a',
        backgroundColor: '#090a0e',
      }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type custom clinical scenario trigger..."
            disabled={isLoading}
            style={{
              flex: 1,
              backgroundColor: '#151a22',
              border: '1px solid #2b3a4a',
              borderRadius: '6px',
              padding: '10px 14px',
              color: '#fff',
              fontSize: '13px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => e.target.style.borderColor = '#66fcf1'}
            onBlur={(e) => e.target.style.borderColor = '#2b3a4a'}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={isLoading || !query.trim()}
            style={{
              backgroundColor: '#10b981',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 16px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => { if (!isLoading && query.trim()) e.currentTarget.style.backgroundColor = '#059669'; }}
            onMouseOut={(e) => { if (!isLoading && query.trim()) e.currentTarget.style.backgroundColor = '#10b981'; }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Custom Styles */}
      <style jsx global>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
        .pulse-icon {
          animation: pulse 2s infinite ease-in-out;
        }
        .animate-spin {
          animation: spin 1.2s infinite linear;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ChatPane;
