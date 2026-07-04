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

  // Column-aware layered layout: each patient/relationship node gets its own wide column on
  // the top level. That patient's conditions are packed beneath them in a sub-grid of up to
  // MAX_PER_ROW nodes per row (so a patient with many items stays short, not a long stack),
  // and their medications sit in a lower band, still within the same column. Every item stays
  // under the patient it belongs to (no cross-patient criss-cross).
  const computePositions = (rawNodes, rawEdges) => {
    const positions = {};
    const MAX_PER_ROW = 3;   // max item nodes per row under a single patient column
    const subX = 175;        // horizontal gap between items within a patient's sub-grid
    const spacingX = MAX_PER_ROW * subX + 40; // patient columns wide enough for a full sub-row
    const rowSpacingY = 150; // vertical gap between rows
    const startY = 60;
    const centerX = 500;     // horizontal center the columns are balanced around

    const patients = rawNodes.filter((n) => n.type === 'Patient');
    const nonPatients = rawNodes.filter((n) => n.type !== 'Patient');
    const patientIds = new Set(patients.map((p) => p.id));

    // Assign each patient a column x, laid out on the top row.
    const colX = {};
    const P = patients.length || 1;
    patients.forEach((p, i) => {
      colX[p.id] = centerX + (i - (P - 1) / 2) * spacingX;
      positions[p.id] = { x: colX[p.id], y: startY };
    });

    // Bucket every condition/medication under the patient it connects to.
    const conds = {};
    const meds = {};
    const unowned = [];
    nonPatients.forEach((node) => {
      const link = (rawEdges || []).find((e) =>
        (e.source === node.id && patientIds.has(e.target)) ||
        (e.target === node.id && patientIds.has(e.source))
      );
      const owner = link ? (link.source === node.id ? link.target : link.source) : null;
      if (owner == null) { unowned.push(node); return; }
      const bucket = node.type === 'Medication' ? meds : conds;
      (bucket[owner] = bucket[owner] || []).push(node);
    });

    // Place a patient's items in a centered sub-grid (<= MAX_PER_ROW per row); returns rows used.
    const rowsFor = (n) => Math.ceil(n / MAX_PER_ROW);
    const placeGrid = (items, cx, bandStartY) => {
      items.forEach((node, idx) => {
        const row = Math.floor(idx / MAX_PER_ROW);
        const inRow = Math.min(MAX_PER_ROW, items.length - row * MAX_PER_ROW);
        const j = idx % MAX_PER_ROW;
        positions[node.id] = {
          x: cx + (j - (inRow - 1) / 2) * subX, // center each row under the patient
          y: bandStartY + row * rowSpacingY,
        };
      });
      return rowsFor(items.length);
    };

    // Conditions band directly under the patients.
    const condStartY = startY + rowSpacingY;
    const maxCondRows = Math.max(0, ...patients.map((p) => rowsFor((conds[p.id] || []).length)));
    patients.forEach((p) => placeGrid(conds[p.id] || [], colX[p.id], condStartY));

    // Medications band below the tallest conditions block, still per patient column.
    const medStartY = condStartY + Math.max(maxCondRows, 1) * rowSpacingY;
    const maxMedRows = Math.max(0, ...patients.map((p) => rowsFor((meds[p.id] || []).length)));
    patients.forEach((p) => placeGrid(meds[p.id] || [], colX[p.id], medStartY));

    // Anything not tied to a patient: park it on a trailing centered row so it still renders.
    const extraY = medStartY + Math.max(maxMedRows, 1) * rowSpacingY;
    placeGrid(unowned, centerX, extraY);

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
      // 2. No query active: show ONLY the logged-in patient and their own medical
      // conditions/medications. Family members (and their conditions) are intentionally
      // hidden here — they surface only when a query traverses to them. graphData still
      // contains the full family subgraph; we just don't render it in this default view.
      const selfNode = graphData.nodes.find((node) => node.id === userId);
      if (selfNode && userId) {
        const selfEdges = graphData.edges.filter((edge) => {
          const isSelfParticipant = edge.source === userId || edge.target === userId;
          if (!isSelfParticipant) return false;
          // Keep only edges to the patient's own conditions/medications, not to other people.
          const otherId = edge.source === userId ? edge.target : edge.source;
          const otherNode = graphData.nodes.find((n) => n.id === otherId);
          return otherNode && otherNode.type !== 'Patient';
        });
        const selfConnectedIds = new Set(
          selfEdges.map((edge) => (edge.source === userId ? edge.target : edge.source))
        );
        activeNodes = graphData.nodes.filter(
          (node) => node.id === userId || selfConnectedIds.has(node.id)
        );
        activeEdges = selfEdges;
      } else {
        // Fallback if the profile isn't resolvable: show everything rather than nothing.
        activeNodes = graphData.nodes;
        activeEdges = graphData.edges;
      }
    }

    // De-duplicate by id so React Flow never receives two nodes/edges with the same key.
    // Duplicates can occur when the same condition is recorded more than once for a person
    // (e.g. as both an own medical_record and a family-history fact, or a note approved twice).
    const dedupeById = (arr) => {
      const seen = new Set();
      return arr.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
    };
    activeNodes = dedupeById(activeNodes);
    activeEdges = dedupeById(activeEdges);

    // Guard against orphan edges: never render an edge unless BOTH endpoints are in the
    // active node set. This prevents dangling HAS_CONDITION lines when the highlighted
    // edge/node sets from the backend traversal don't line up perfectly.
    const activeNodeIds = new Set(activeNodes.map((n) => n.id));
    activeEdges = activeEdges.filter((e) => activeNodeIds.has(e.source) && activeNodeIds.has(e.target));

    const positions = computePositions(activeNodes, activeEdges);
    const typeById = {};
    activeNodes.forEach((n) => { typeById[n.id] = n.type; });

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

      // Route the edge through the right handles: same-level patient↔patient links exit/enter
      // from the SIDES, while a patient → condition/medication link drops from the bottom into
      // the child's top. This keeps sibling links horizontal and child links vertical.
      let sourceHandle = 'bs';
      let targetHandle = 'tt';
      if (typeById[edge.source] === 'Patient' && typeById[edge.target] === 'Patient') {
        const sx = positions[edge.source]?.x ?? 0;
        const tx = positions[edge.target]?.x ?? 0;
        if (sx <= tx) { sourceHandle = 'rs'; targetHandle = 'lt'; }
        else { sourceHandle = 'ls'; targetHandle = 'rt'; }
      }
      
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
        sourceHandle,
        targetHandle,
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
        // Re-key on the visible node set so fitView re-runs (and re-centers/zooms) whenever
        // the layout changes — e.g. switching between the self view and a query traversal.
        key={nodes.map((n) => n.id).join(',')}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        // Low padding so the graph fills ~60-80% of the pane; cap zoom so tiny graphs
        // (e.g. the self view with 2-3 nodes) don't blow up to full size.
        fitViewOptions={{ padding: 0.12, maxZoom: 1.1 }}
        minZoom={0.3}
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
