// src/App.tsx
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
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
  // Start (source node) and end (mouse pointer) of the preview arrow, in container pixels
  const [origin, setOrigin] = createSignal<{ x: number; y: number } | null>(null);
  const [pointer, setPointer] = createSignal<{ x: number; y: number } | null>(null);
  const [edgeCount, setEdgeCount] = createSignal(0);

  // Initial nodes are placed on a circle so they never overlap
  for (let i = 0; i < NODE_COUNT; i++) {
    const angle = (2 * Math.PI * i) / NODE_COUNT;
    graph.addNode(`n${i}`, {
      label: `Node ${i}`,
      x: Math.cos(angle),
      y: Math.sin(angle),
      size: 10,
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
    console.log("addEdge", from, to);
    if (from === to || graph.hasDirectedEdge(from, to)) return;
    graph.addDirectedEdge(from, to);
    console.log("edge added, size =", graph.size);
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
        console.log("downNode with ctrl", node);
        setSource(node);
        sigma.getCamera().enabled = false; // do not pan the camera while dragging an edge
        // The camera is frozen while dragging, so the origin stays valid
        setOrigin(sigma.graphToViewport(graph.getNodeAttributes(node)));
        setPointer({ x: event.x, y: event.y });
        preventSigmaDefault(); // do not drag the node itself
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

    sigma.on("moveBody", ({ event }) => {
      if (source()) setPointer({ x: event.x, y: event.y });
    });

    // Releasing the mouse over another node completes the edge
    sigma.on("upNode", ({ node }) => {
      const from = source();
      console.log("upNode", node, "source =", from);
      if (from) addEdge(from, node);
    });
    // Deferred so it runs after upNode, wherever the mouse is released
    const onMouseUp = () =>
      setTimeout(() => {
        setSource(null);
        setOrigin(null);
        setPointer(null);
        sigma.getCamera().enabled = true;
      });
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
        graph.setNodeAttribute(node, "size", active ? 35 : 30);
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
      <div style={{ flex: "1", "min-height": "0", position: "relative" }}>
        {/* Sigma needs a container with an explicit, non-zero size */}
        <div ref={container} style={{ width: "100%", height: "100%" }} />
        {/* Preview arrow while dragging; pointer-events: none keeps it from blocking Sigma */}
        <Show when={origin() && pointer()}>
          <svg
            style={{
              position: "absolute",
              inset: "0",
              width: "100%",
              height: "100%",
              "pointer-events": "none",
            }}
          >
            <defs>
              <marker id="preview-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#999" />
              </marker>
            </defs>
            <line
              x1={origin()!.x}
              y1={origin()!.y}
              x2={pointer()!.x}
              y2={pointer()!.y}
              stroke="#999"
              stroke-width="3"
              opacity="0.5"
              marker-end="url(#preview-arrow)"
            />
          </svg>
        </Show>
      </div>
    </div>
  );
}
