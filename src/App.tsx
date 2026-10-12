// src/App.tsx
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";

const NODE_COUNT = 10;

const randomColor = () =>
  "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");

export default function App() {
  let container!: HTMLDivElement;
  let sigma!: Sigma;
  let hoveredNode: string | null = null;

  const graph = new Graph({ type: "directed" });
  const [source, setSource] = createSignal<string | null>(null);
  const [selectedEdge, setSelectedEdge] = createSignal<string | null>(null);
  const [edgeCount, setEdgeCount] = createSignal(0);

  // Initial nodes are placed on a circle so they never overlap
  for (let i = 0; i < NODE_COUNT; i++) {
    const angle = (2 * Math.PI * i) / NODE_COUNT;
    graph.addNode(`n${i}`, {
      label: `Node ${i}`,
      x: Math.cos(angle),
      y: Math.sin(angle),
      size: 8,
      color: randomColor(),
    });
  }

  // Compute a force-directed layout and write the positions into the graph
  const relayout = () => {
    forceAtlas2.assign(graph, {
      iterations: 300,
      settings: forceAtlas2.inferSettings(graph),
    });
  };

  const addEdge = (from: string, to: string) => {
    if (from === to || graph.hasDirectedEdge(from, to)) return;
    graph.addDirectedEdge(from, to);
    setEdgeCount(graph.size);
    relayout();
  };

  const deleteSelectedEdge = () => {
    const edge = selectedEdge();
    if (!edge) return;
    graph.dropEdge(edge);
    setSelectedEdge(null);
    setEdgeCount(graph.size);
    relayout();
  };

  onMount(() => {
    sigma = new Sigma(graph, container, {
      enableEdgeEvents: true, // required for clickEdge
      defaultEdgeType: "arrow", // built-in in Sigma v3
      defaultEdgeColor: "#999",
      // Thick edges are easier to click
      nodeReducer: (node, data) =>
        node === source() ? { ...data, size: data.size * 1.5 } : data,
      edgeReducer: (edge, data) =>
        edge === selectedEdge()
          ? { ...data, color: "#e11", size: 4 }
          : { ...data, size: 3 },
    });

    // Ctrl (or Cmd) + drag from a node starts an edge
    sigma.on("downNode", ({ node, event }) => {
      const original = event.original as MouseEvent;
      if (original.ctrlKey || original.metaKey) {
        setSource(node);
        event.preventSigmaDefault(); // do not pan the camera
      }
    });
    sigma.on("enterNode", ({ node }) => (hoveredNode = node));
    sigma.on("leaveNode", () => (hoveredNode = null));

    sigma.on("clickEdge", ({ edge }) => setSelectedEdge(edge));
    sigma.on("clickStage", () => setSelectedEdge(null));

    // Releasing the mouse over another node completes the edge
    const onMouseUp = () => {
      const from = source();
      if (from && hoveredNode) addEdge(from, hoveredNode);
      setSource(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") deleteSelectedEdge();
    };
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);

    // Re-render when selection state changes
    createEffect(() => {
      source();
      selectedEdge();
      sigma.refresh();
    });

    onCleanup(() => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      sigma.kill();
    });
  });

  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
      <div style={{ padding: "8px", font: "14px sans-serif" }}>
        Ctrl+drag from a node to another node: add edge / click an edge, then
        Delete: remove edge / edges: {edgeCount()}
        <button onClick={deleteSelectedEdge} disabled={!selectedEdge()} style={{ "margin-left": "8px" }}>
          Delete selected edge
        </button>
      </div>
      {/* Sigma needs a container with an explicit, non-zero size */}
      <div ref={container} style={{ flex: "1", "min-height": "0", position: "relative" }} />
    </div>
  );
}
