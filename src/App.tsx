// src/App.tsx
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import Graph from "graphology";
import Sigma, { DEFAULT_STYLES } from "sigma";
import { extremityArrow, layerFill, layerPlain, pathLine } from "sigma/rendering";
import ForceSupervisor from "graphology-layout-force/worker";
import data from "../data.json";

export default function App() {
  let container!: HTMLDivElement;
  let sigma!: Sigma;

  const graph = new Graph({ type: "directed" });
  const [selectedEdge, setSelectedEdge] = createSignal<string | null>(null);
  const [selectedNode, setSelectedNode] = createSignal<string | null>(null);
  const [edgeCount, setEdgeCount] = createSignal(0);

  // Load the fixture (nodes, edges, colors and positions) from data.json
  graph.import(data);
  // Remember the original node sizes so the selection highlight can scale them
  graph.updateEachNodeAttributes((_, attr) => ({ ...attr, baseSize: attr.size }));
  setEdgeCount(graph.size);

  const deleteSelectedEdge = () => {
    const edge = selectedEdge();
    if (!edge) return;
    graph.dropEdge(edge);
    setSelectedEdge(null);
    setEdgeCount(graph.size);
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
        nodes: [
          DEFAULT_STYLES.nodes,
          { cursor: "grab" },
          { whenState: "isDragged", then: { cursor: "grabbing" } },
        ],
        edges: [DEFAULT_STYLES.edges, { head: "arrow" }],
      },
      settings: {
        enableEdgeEvents: true, // required for clickEdge
        enableNodeDrag: true, // drag nodes with the mouse
        // Rescale only once, otherwise the view jumps around while a node is dragged
        autoRescale: "once",
        // v4 defaults to "positions", which would read size 8 in graph coordinates (huge nodes)
        itemSizesReference: "screen",
      },
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

    // Live force layout: dragged nodes are pinned, and the layout resumes on release
    const layout = new ForceSupervisor(graph, {
      settings: { repulsion: 0.2, attraction: 0.0002 },
      isNodeFixed: (node) => sigma.getNodeState(node).isDragged,
    });
    layout.start();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") deleteSelectedEdge();
    };
    window.addEventListener("keydown", onKeyDown);

    // Push selection state into node/edge attributes (sizes are in pixels).
    // Thick edges are easier to click.
    createEffect(() => {
      edgeCount(); // re-run when edges are added or removed
      graph.forEachNode((node) => {
        const active = node === selectedNode();
        const base = graph.getNodeAttribute(node, "baseSize");
        graph.setNodeAttribute(node, "size", active ? base * 1.3 : base);
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
      window.removeEventListener("keydown", onKeyDown);
      layout.kill();
      sigma.kill();
    });
  });

  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
      <div style={{ padding: "8px", font: "14px sans-serif" }}>
        Drag a node to move it / click an edge, then Delete: remove edge /
        edges: {edgeCount()}
        <button onClick={deleteSelectedEdge} disabled={!selectedEdge()} style={{ "margin-left": "8px" }}>
          Delete selected edge
        </button>
      </div>
      <div style={{ flex: "1", "min-height": "0", position: "relative" }}>
        {/* Sigma needs a container with an explicit, non-zero size */}
        <div ref={container} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}
