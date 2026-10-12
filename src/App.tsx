// src/App.tsx
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import Graph from "graphology";
import Sigma, { DEFAULT_STYLES } from "sigma";
import { extremityArrow, layerFill, layerPlain, pathLine } from "sigma/rendering";
import forceAtlas2 from "graphology-layout-forceatlas2";

const NODE_COUNT = 10;

const randomColor = () =>
  "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");

export default function App() {
  let container!: HTMLDivElement;
  let sigma!: Sigma;

  const graph = new Graph({ type: "directed" });
  const [source, setSource] = createSignal<string | null>(null);
  const [selectedEdge, setSelectedEdge] = createSignal<string | null>(null);
  const [selectedNode, setSelectedNode] = createSignal<string | null>(null);
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
    // Few iterations and fixed forces keep nodes from collapsing into one blob
    forceAtlas2.assign(graph, {
      iterations: 100,
      settings: {
        ...forceAtlas2.inferSettings(graph),
        gravity: 1,
        scalingRatio: 10,
        slowDown: 10,
      },
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

  // Find the node nearest to the mouse pointer (within 20px), if any
  const nodeAt = (e: MouseEvent): string | null => {
    const rect = container.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let best: string | null = null;
    let bestDist = 20;
    graph.forEachNode((node, attrs) => {
      const p = sigma.graphToViewport({ x: attrs.x, y: attrs.y });
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bestDist) {
        best = node;
        bestDist = d;
      }
    });
    return best;
  };

  onMount(() => {
    sigma = new Sigma(graph, container, {
      // Sigma v4 draws shapes through primitives: circle nodes, straight edges with arrowheads
      primitives: {
        nodes: { layers: [layerFill()] },
        edges: {
          paths: [pathLine()],
          extremities: [extremityArrow()],
          layers: [layerPlain()],
        },
      },
      styles: {
        nodes: [DEFAULT_STYLES.nodes],
        edges: [DEFAULT_STYLES.edges, { head: "arrow" }],
      },
      settings: {
        enableEdgeEvents: true, // required for clickEdge
        // v4 defaults to "positions", which would read size 8 in graph coordinates (huge nodes)
        itemSizesReference: "screen",
      },
    });

    // Ctrl (or Cmd) + drag from a node starts an edge
    sigma.on("downNode", ({ node, event, preventSigmaDefault }) => {
      const original = event.original as MouseEvent;
      if (original.ctrlKey || original.metaKey) {
        setSource(node);
        preventSigmaDefault(); // do not pan the camera
      }
    });

    // Selecting a node and selecting an edge are mutually exclusive
    sigma.on("clickNode", ({ node }) => {
      setSelectedNode(node);
      setSelectedEdge(null);
    });
    sigma.on("clickEdge", ({ edge }) => {
      setSelectedEdge(edge);
      setSelectedNode(null);
    });
    sigma.on("clickStage", () => {
      setSelectedEdge(null);
      setSelectedNode(null);
    });

    // Releasing the mouse over another node completes the edge
    const onMouseUp = (e: MouseEvent) => {
      const from = source();
      if (!from) return;
      const to = nodeAt(e);
      if (to) addEdge(from, to);
      setSource(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") deleteSelectedEdge();
    };
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);

    // Push selection state into node/edge attributes (sizes are in pixels).
    // Thick edges are easier to click.
    createEffect(() => {
      edgeCount(); // re-run when edges are added or removed
      graph.forEachNode((node) => {
        const active = node === source() || node === selectedNode();
        graph.setNodeAttribute(node, "size", active ? 12 : 8);
      });
      graph.forEachEdge((edge) => {
        const selected = edge === selectedEdge();
        graph.mergeEdgeAttributes(edge, {
          size: selected ? 6 : 4,
          color: selected ? "#e11" : "#999",
        });
      });
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
