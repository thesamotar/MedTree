import React, { useEffect } from 'react';
import { ReactFlow, Controls, Background, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomNode from './CustomNode';

const nodeTypes = {
  custom: CustomNode,
};

const GraphPane = ({ graphData, traversalPath }) => {
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

  // Build flow nodes/edges from graphData prop
  // Build and filter flow nodes/edges based on active traversal path
  useEffect(() => {
    if (!graphData || !graphData.nodes) return;

    const highlightedNodeIds = traversalPath?.nodes || [];
    const highlightedEdgeIds = traversalPath?.edges || [];
    const hasHighlight = highlightedNodeIds.length > 0;

    // Filter nodes and edges to ONLY show relevant ones when pathfinding is active
    const activeNodes = hasHighlight
      ? graphData.nodes.filter((node) => highlightedNodeIds.includes(node.id))
      : graphData.nodes;

    const activeEdges = hasHighlight
      ? graphData.edges.filter((edge) => highlightedEdgeIds.includes(edge.id))
      : graphData.edges;

    const positions = computePositions(activeNodes);

    const flowNodes = activeNodes.map((node) => ({
      id: node.id,
      type: 'custom',
      position: positions[node.id] || { x: Math.random() * 600, y: Math.random() * 400 },
      data: {
        label: node.label,
        type: node.type,
        highlighted: hasHighlight, // Glow the nodes if a path is active
      },
    }));

    const flowEdges = activeEdges.map((edge) => {
      const isHighlighted = highlightedEdgeIds.includes(edge.id);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: 'default',
        animated: hasHighlight,
        className: hasHighlight ? 'highlighted-edge' : '',
        style: hasHighlight
          ? { stroke: '#38bdf8', strokeWidth: 4 }
          : { stroke: '#4b5563', strokeWidth: 1.5 },
        labelStyle: { fill: '#9ca3af', fontSize: 10, fontWeight: 500 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 2,
        labelBgStyle: { fill: '#0f172a', color: '#fff', fillOpacity: 0.8 },
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [graphData, traversalPath]);

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
