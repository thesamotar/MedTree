import React, { useEffect, useState, useMemo } from 'react';
import { ReactFlow, Controls, Background } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomNode from './CustomNode';

const nodeTypes = {
  custom: CustomNode,
};

const GraphPane = ({ graphData, traversalPath }) => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

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
  useEffect(() => {
    if (!graphData || !graphData.nodes) return;

    const positions = computePositions(graphData.nodes);

    const flowNodes = graphData.nodes.map((node) => ({
      id: node.id,
      type: 'custom',
      position: positions[node.id] || { x: Math.random() * 600, y: Math.random() * 400 },
      data: {
        label: node.label,
        type: node.type,
        highlighted: false,
      },
    }));

    const flowEdges = graphData.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: 'default',
      style: { stroke: '#4b5563', strokeWidth: 1.5 },
      labelStyle: { fill: '#9ca3af', fontSize: 10, fontWeight: 500 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 2,
      labelBgStyle: { fill: '#0f172a', color: '#fff', fillOpacity: 0.8 },
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [graphData]);

  // Apply traversal highlighting
  useEffect(() => {
    if (nodes.length === 0) return;

    const highlightedNodeIds = traversalPath?.nodes || [];
    const highlightedEdgeIds = traversalPath?.edges || [];

    setNodes((prev) =>
      prev.map((node) => ({
        ...node,
        data: {
          ...node.data,
          highlighted: highlightedNodeIds.includes(node.id),
        },
      }))
    );

    setEdges((prev) =>
      prev.map((edge) => {
        const isHighlighted = highlightedEdgeIds.includes(edge.id);
        return {
          ...edge,
          animated: isHighlighted,
          className: isHighlighted ? 'highlighted-edge' : '',
          style: isHighlighted
            ? { stroke: '#38bdf8', strokeWidth: 4 }
            : { stroke: '#4b5563', strokeWidth: 1.5 },
        };
      })
    );
  }, [traversalPath]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
