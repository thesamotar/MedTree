import React, { useEffect, useState } from 'react';
import { ReactFlow, MiniMap, Controls, Background } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomNode from './CustomNode';

const nodeTypes = {
  custom: CustomNode,
};

// Preset node positions for a highly structured, readable medical layout
const NODE_POSITIONS = {
  // Pharmacogenomics Cluster (Top Left)
  alex_jensen: { x: 50, y: 80 },
  sarah_jensen: { x: 250, y: 50 },
  cyp2d6_deficiency: { x: 450, y: 120 },
  codeine: { x: 220, y: 220 },

  // Autoimmune Cluster (Bottom Left)
  lily_chen: { x: 50, y: 380 },
  david_chen: { x: 250, y: 480 },
  psoriasis: { x: 450, y: 380 },
  psoriatic_arthritis: { x: 220, y: 600 },

  // Environmental Proximity Cluster (Right Side)
  marcus_vance: { x: 750, y: 80 },
  leo_brooks: { x: 980, y: 180 },
  apartment_3b: { x: 750, y: 320 },
  toxic_mold: { x: 750, y: 540 },
  respiratory_distress: { x: 980, y: 400 },
};

const GraphPane = ({ traversalPath }) => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

  // Fetch the full graph representation from FastAPI
  useEffect(() => {
    const fetchGraph = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/graph');
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        updateGraphState(data);
      } catch (err) {
        console.warn('Could not load graph from backend, using default local copy.', err);
        // Fallback default graph (same as backend DEFAULT_GRAPH)
        const fallbackData = {
          nodes: [
            { id: "alex_jensen", label: "Alex Jensen", type: "Patient", group: "pharmacogenomics" },
            { id: "sarah_jensen", label: "Sarah Jensen", type: "Patient", group: "pharmacogenomics" },
            { id: "cyp2d6_deficiency", label: "CYP2D6 Deficiency", type: "GeneticCondition", group: "pharmacogenomics" },
            { id: "codeine", label: "Codeine", type: "Medication", group: "pharmacogenomics" },
            { id: "lily_chen", label: "Lily Chen", type: "Patient", group: "autoimmune" },
            { id: "david_chen", label: "David Chen", type: "Patient", group: "autoimmune" },
            { id: "psoriasis", label: "Psoriasis", type: "AutoimmuneCondition", group: "autoimmune" },
            { id: "psoriatic_arthritis", label: "Psoriatic Arthritis", type: "Risk", group: "autoimmune" },
            { id: "marcus_vance", label: "Marcus Vance", type: "Patient", group: "environmental" },
            { id: "leo_brooks", label: "Leo Brooks", type: "Patient", group: "environmental" },
            { id: "apartment_3b", label: "Apartment 3B", type: "Location", group: "environmental" },
            { id: "toxic_mold", label: "Toxic Black Mold", type: "EnvironmentalFactor", group: "environmental" },
            { id: "respiratory_distress", label: "Respiratory Distress", type: "Symptom", group: "environmental" }
          ],
          edges: [
            { id: "e_alex_sarah", source: "alex_jensen", target: "sarah_jensen", label: "CHILD_OF", group: "pharmacogenomics" },
            { id: "e_sarah_cyp2d6", source: "sarah_jensen", target: "cyp2d6_deficiency", label: "HAS_CONDITION", group: "pharmacogenomics" },
            { id: "e_cyp2d6_codeine", source: "cyp2d6_deficiency", target: "codeine", label: "AFFECTS_METABOLISM", group: "pharmacogenomics" },
            { id: "e_alex_codeine", source: "alex_jensen", target: "codeine", label: "PRESCRIBED", group: "pharmacogenomics" },
            { id: "e_lily_david", source: "lily_chen", target: "david_chen", label: "CHILD_OF", group: "autoimmune" },
            { id: "e_david_psoriasis", source: "david_chen", target: "psoriasis", label: "HAS_HISTORY", group: "autoimmune" },
            { id: "e_psoriasis_arthritis", source: "psoriasis", target: "psoriatic_arthritis", label: "CLUSTERS_WITH", group: "autoimmune" },
            { id: "e_lily_arthritis", source: "lily_chen", target: "psoriatic_arthritis", label: "SUSPECTED_RISK", group: "autoimmune" },
            { id: "e_marcus_leo", source: "marcus_vance", target: "leo_brooks", label: "LIVES_WITH", group: "environmental" },
            { id: "e_marcus_apt", source: "marcus_vance", target: "apartment_3b", "label": "LIVES_AT", group: "environmental" },
            { id: "e_leo_apt", source: "leo_brooks", target: "apartment_3b", "label": "LIVES_AT", group: "environmental" },
            { id: "e_leo_respiratory", source: "leo_brooks", target: "respiratory_distress", label: "HAS_SYMPTOM", group: "environmental" },
            { id: "e_apt_mold", source: "apartment_3b", target: "toxic_mold", label: "INFESTED_WITH", group: "environmental" },
            { id: "e_mold_respiratory", source: "toxic_mold", target: "respiratory_distress", label: "CAUSES", group: "environmental" },
            { id: "e_marcus_respiratory", source: "marcus_vance", target: "respiratory_distress", label: "DEVELOPED_SYMPTOM", group: "environmental" }
          ]
        };
        updateGraphState(fallbackData);
      }
    };

    fetchGraph();
  }, []);

  // Update flow nodes and edges whenever traversalPath updates
  useEffect(() => {
    if (nodes.length === 0) return;

    const highlightedNodeIds = traversalPath?.nodes || [];
    const highlightedEdgeIds = traversalPath?.edges || [];

    // Map highlighted classes
    setNodes((prevNodes) =>
      prevNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          highlighted: highlightedNodeIds.includes(node.id),
        },
      }))
    );

    setEdges((prevEdges) =>
      prevEdges.map((edge) => {
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

  const updateGraphState = (rawGraph) => {
    // 1. Transform raw nodes to React Flow format
    const flowNodes = rawGraph.nodes.map((node) => {
      const position = NODE_POSITIONS[node.id] || { x: Math.random() * 800, y: Math.random() * 500 };
      return {
        id: node.id,
        type: 'custom', // custom node types
        position,
        data: {
          label: node.label,
          type: node.type,
          highlighted: false,
        },
      };
    });

    // 2. Transform raw edges to React Flow format
    const flowEdges = rawGraph.edges.map((edge) => {
      return {
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
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background color="#222" gap={16} size={1} />
        <Controls showInteractive={false} style={{ background: '#1f2833', border: '1px solid #2b3a4a', color: '#fff' }} />
      </ReactFlow>
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid #2b3a4a',
        padding: '10px 14px',
        borderRadius: '6px',
        fontSize: '12px',
        pointerEvents: 'none',
        zIndex: 4,
      }}>
        <div style={{ fontWeight: 600, color: '#66fcf1', marginBottom: '4px' }}>MedTree Memory Traversal</div>
        <div style={{ color: '#9ca3af' }}>Multi-hop relationship graph extracted by Cognee</div>
      </div>
    </div>
  );
};

export default GraphPane;
