import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { User, Pill, ShieldAlert, Dna, AlertTriangle, Home, Wind, Activity } from 'lucide-react';

const CustomNode = ({ data, isConnectable }) => {
  const { label, type, highlighted } = data;

  const getIcon = (nodeType) => {
    const iconSize = 16;
    const lowerType = (nodeType || '').toLowerCase();
    switch (lowerType) {
      case 'patient':
        return <User size={iconSize} style={{ color: '#60a5fa' }} />;
      case 'medication':
        return <Pill size={iconSize} style={{ color: '#34d399' }} />;
      case 'geneticcondition':
        return <Dna size={iconSize} style={{ color: '#a78bfa' }} />;
      case 'autoimmunecondition':
        return <Activity size={iconSize} style={{ color: '#fb7185' }} />;
      case 'risk':
        return <AlertTriangle size={iconSize} style={{ color: '#f87171' }} />;
      case 'location':
        return <Home size={iconSize} style={{ color: '#fbbf24' }} />;
      case 'environmentalfactor':
        return <Wind size={iconSize} style={{ color: '#f472b6' }} />;
      case 'symptom':
        return <ShieldAlert size={iconSize} style={{ color: '#22d3ee' }} />;
      default:
        return <Activity size={iconSize} style={{ color: '#c5c6c7' }} />;
    }
  };

  const nodeTypeClass = (type || '').toLowerCase();

  return (
    <div className={`custom-node node-${nodeTypeClass} ${highlighted ? 'highlighted' : ''}`}>
      {/* Top: incoming from the patient above (conditions/medications connect here) */}
      <Handle id="tt" type="target" position={Position.Top} isConnectable={isConnectable} style={{ background: '#555', borderRadius: '3px' }} />
      {/* Left & right carry same-level sibling (patient↔patient) links, either direction */}
      <Handle id="lt" type="target" position={Position.Left} isConnectable={isConnectable} style={{ background: '#555', borderRadius: '3px' }} />
      <Handle id="ls" type="source" position={Position.Left} isConnectable={isConnectable} style={{ background: '#555', borderRadius: '3px' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div className="node-icon-container">
          {getIcon(type)}
        </div>
        <div>
          <div className="node-header">{label}</div>
          <div className="node-type">{type}</div>
        </div>
      </div>

      {/* Bottom: outgoing to this node's own conditions/medications below */}
      <Handle id="bs" type="source" position={Position.Bottom} isConnectable={isConnectable} style={{ background: '#555', borderRadius: '3px' }} />
      {/* Right: same-level sibling links, either direction */}
      <Handle id="rt" type="target" position={Position.Right} isConnectable={isConnectable} style={{ background: '#555', borderRadius: '3px' }} />
      <Handle id="rs" type="source" position={Position.Right} isConnectable={isConnectable} style={{ background: '#555', borderRadius: '3px' }} />
    </div>
  );
};

export default CustomNode;
