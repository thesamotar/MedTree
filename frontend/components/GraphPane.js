import React, { useEffect } from 'react';
import { ReactFlow, Controls, Background, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomNode from './CustomNode';

const nodeTypes = {
  custom: CustomNode,
};

const GraphPane = ({ graphData, traversalPath, userId }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Auto-layout: arrange nodes in a force-directed-like grid
  const computePositions = (rawNodes) => {
    const positions = {};
    const cols = Math.ceil(Math.sqrt(rawNodes.length));
    rawNodes.forEach((node, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      positions[node.id] = {
        x: 80 + col * 240 + (row % 2 === 1 ? 120 : 0), // stagger odd rows
        y: 60 + row * 180,
      };
    });
    return positions;
  };

  // Build and filter flow nodes/edges based on active traversal path
  useEffect(() => {
    if (!graphData || !graphData.nodes) return;

    const highlightedNodeIds = traversalPath?.nodes || [];
    const highlightedEdgeIds = traversalPath?.edges || [];
    const hasHighlight = highlightedNodeIds.length > 0;

    let activeNodes = [];
    let activeEdges = [];

    if (hasHighlight) {
      // 1. If query pathway highlights are active, filter to only those nodes/edges
      activeNodes = graphData.nodes.filter((node) => highlightedNodeIds.includes(node.id));
      activeEdges = graphData.edges.filter((edge) => highlightedEdgeIds.includes(edge.id));
    } else {
      // 2. If NO query is active, show only the current user (userId) and their direct medical conditions/medications
      const selfNode = graphData.nodes.find((node) => node.id === userId);
      
      if (selfNode && userId) {
        // Find direct edges from current user to conditions/medications (exclude family links)
        const selfEdges = graphData.edges.filter((edge) => {
          const isSelfParticipant = edge.source === userId || edge.target === userId;
          if (!isSelfParticipant) return false;
          
          const otherNodeId = edge.source === userId ? edge.target : edge.source;
          const otherNode = graphData.nodes.find(n => n.id === otherNodeId);
          return otherNode && otherNode.type !== 'Patient';
        });

        const selfConnectedNodeIds = new Set(
          selfEdges.map((edge) => (edge.source === userId ? edge.target : edge.source))
        );

        activeNodes = graphData.nodes.filter(
          (node) => node.id === userId || selfConnectedNodeIds.has(node.id)
        );
        activeEdges = selfEdges;
      } else {
        // Fallback in case of missing profile details
        activeNodes = graphData.nodes;
        activeEdges = graphData.edges;
      }
    }

    const positions = computePositions(activeNodes);

    const flowNodes = activeNodes.map((node) => ({
      id: node.id,
      type: 'custom',
      position: positions[node.id] || { x: Math.random() * 600, y: Math.random() * 400 },
      data: {
        label: node.label,
        type: node.type,
        highlighted: hasHighlight,
      },
    }));

    const flowEdges = activeEdges.map((edge) => {
      const isHighlighted = highlightedEdgeIds.includes(edge.id);
      const label = edge.label || '';
      
      // Determine colors and styles based on connection category
      let strokeColor = '#4b5563'; // default gray
      let strokeWidth = 1.5;
      let className = '';

      if (['CHILD_OF', 'PARENT_OF', 'SIBLING_OF', 'SPOUSE_OF', 'LIVES_WITH', 'LIVES_AT', 'INFESTED_WITH', 'CAUSES'].includes(label)) {
        strokeColor = isHighlighted ? '#fb923c' : '#f97316'; // Orange for family/environments
        className = isHighlighted ? 'highlighted-edge-relationship' : '';
      } else if (label === 'HAS_CONDITION') {
        strokeColor = isHighlighted ? '#c084fc' : '#8b5cf6'; // Purple for conditions
        className = isHighlighted ? 'highlighted-edge-condition' : '';
      } else if (['TAKES', 'PRESCRIBED'].includes(label)) {
        strokeColor = isHighlighted ? '#4ade80' : '#16a34a'; // Green for medications
        className = isHighlighted ? 'highlighted-edge-medication' : '';
      }

      if (isHighlighted) {
        strokeWidth = 4;
      }

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: 'default',
        animated: isHighlighted,
        className: className,
        style: { stroke: strokeColor, strokeWidth: strokeWidth },
        labelStyle: { fill: '#9ca3af', fontSize: 10, fontWeight: 500 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 2,
        labelBgStyle: { fill: '#0f172a', color: '#fff', fillOpacity: 0.8 },
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [graphData, traversalPath, userId]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.4}
        maxZoom={1.5}
      >
        <Background color="#222" gap={16} size={1} />
        <Controls showInteractive={false} style={{ background: '#1f2833', border: '1px solid #2b3a4a', color: '#fff' }} />
      </ReactFlow>
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid #2b3a4a',
        padding: '10px 14px',
        borderRadius: '6px',
        fontSize: '12px',
        pointerEvents: 'none',
        zIndex: 4,
      }}>
        <div style={{ fontWeight: 600, color: '#66fcf1', marginBottom: '4px' }}>MedTree Memory Traversal</div>
        <div style={{ color: '#9ca3af' }}>Multi-hop relationship graph from your medical data</div>
      </div>
    </div>
  );
};

export default GraphPane;
