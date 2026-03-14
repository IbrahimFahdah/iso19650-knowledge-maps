const DEFAULT_GRAPH_PATH = "graphs/iso19650-core-system.json";

const availableGraphs = [
  {
    label: "ISO 19650 Core System",
    path: DEFAULT_GRAPH_PATH,
    description: "Core concepts, roles, processes, systems, and information flows."
  }
];

const graphNameEl = document.getElementById("graphName");
const graphDescriptionEl = document.getElementById("graphDescription");
const graphVersionEl = document.getElementById("graphVersion");
const graphTagsEl = document.getElementById("graphTags");
const graphListEl = document.getElementById("graphList");
const graphStatusEl = document.getElementById("graphStatus");
const selectionTypeEl = document.getElementById("selectionType");
const detailsListEl = document.getElementById("detailsList");
const reloadDefaultBtn = document.getElementById("reloadDefaultBtn");

let cy;
let dragDepth = 0;

function setStatus(message, isError = false) {
  graphStatusEl.textContent = message;
  graphStatusEl.style.color = isError ? "#b91c1c" : "";
  graphStatusEl.style.background = isError ? "rgba(185, 28, 28, 0.10)" : "rgba(15, 23, 42, 0.06)";
}

function validateGraphPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Graph file must contain a JSON object.");
  }

  if (!payload.metadata || !payload.graph) {
    throw new Error("Graph JSON must contain both 'metadata' and 'graph' sections.");
  }

  if (!Array.isArray(payload.graph.nodes) || !Array.isArray(payload.graph.edges)) {
    throw new Error("Graph JSON must contain 'graph.nodes' and 'graph.edges' arrays.");
  }
}

function renderMetadata(metadata) {
  graphNameEl.textContent = metadata.name || "Untitled Graph";
  graphDescriptionEl.textContent = metadata.description || "-";
  graphVersionEl.textContent = metadata.version || "-";
  graphTagsEl.textContent = Array.isArray(metadata.tags) && metadata.tags.length > 0
    ? metadata.tags.join(", ")
    : "-";
}

function renderDetails(title, fields) {
  selectionTypeEl.textContent = title;
  detailsListEl.innerHTML = "";

  fields.forEach(({ label, value }) => {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");

    dt.textContent = label;
    dd.textContent = value || "-";

    wrapper.append(dt, dd);
    detailsListEl.appendChild(wrapper);
  });
}

function resetDetails() {
  renderDetails("Nothing selected", [
    {
      label: "Hint",
      value: "Click a node or edge to inspect its details."
    }
  ]);
}

function getNodeColor(type) {
  const colorMap = {
    concept: "#2563eb",
    role: "#16a34a",
    process: "#ea580c",
    information: "#9333ea",
    system: "#6b7280"
  };

  return colorMap[type] || "#0f172a";
}

function initializeCytoscape(elements) {
  if (cy) {
    cy.destroy();
  }

  cy = cytoscape({
    container: document.getElementById("cy"),
    elements,
    layout: { name: "cose", animate: true, fit: true, padding: 24 },
    style: [
      {
        selector: "node",
        style: {
          "background-color": ele => getNodeColor(ele.data("type")),
          label: "data(label)",
          color: "#10203a",
          "font-size": 12,
          "font-weight": 600,
          "text-valign": "bottom",
          "text-margin-y": 8,
          "text-wrap": "wrap",
          "text-max-width": 120,
          width: 28,
          height: 28,
          "border-width": 2,
          "border-color": "#ffffff"
        }
      },
      {
        selector: "edge",
        style: {
          width: 2.2,
          "line-color": "#94a3b8",
          "target-arrow-color": "#94a3b8",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "data(relationship)",
          "font-size": 10,
          color: "#475569",
          "text-background-color": "#ffffff",
          "text-background-opacity": 0.9,
          "text-background-padding": 2
        }
      },
      {
        selector: ".faded",
        style: {
          opacity: 0.15
        }
      },
      {
        selector: ".highlighted",
        style: {
          opacity: 1,
          "line-color": "#1d4ed8",
          "target-arrow-color": "#1d4ed8",
          "border-color": "#1d4ed8",
          "border-width": 3
        }
      }
    ],
    wheelSensitivity: 0.2
  });

  cy.on("tap", "node", event => {
    const node = event.target;
    const neighborhood = node.closedNeighborhood();

    cy.elements().addClass("faded").removeClass("highlighted");
    neighborhood.removeClass("faded").addClass("highlighted");

    renderDetails("Node", [
      { label: "Label", value: node.data("label") },
      { label: "Type", value: node.data("type") },
      { label: "Description", value: node.data("description") }
    ]);
  });

  cy.on("tap", "edge", event => {
    const edge = event.target;

    cy.elements().addClass("faded").removeClass("highlighted");
    edge.connectedNodes().removeClass("faded").addClass("highlighted");
    edge.removeClass("faded").addClass("highlighted");

    renderDetails("Edge", [
      { label: "Relationship", value: edge.data("relationship") },
      { label: "Evidence Quote", value: edge.data("evidenceQuote") },
      { label: "Source Reference", value: edge.data("sourceReference") },
      { label: "Evidence Type", value: edge.data("evidenceType") }
    ]);
  });

  cy.on("tap", event => {
    if (event.target === cy) {
      cy.elements().removeClass("faded highlighted");
      resetDetails();
    }
  });
}

function toCytoscapeElements(graph) {
  const nodes = graph.nodes.map(node => ({
    data: {
      id: node.id,
      label: node.label,
      type: node.type,
      description: node.description
    }
  }));

  const edges = graph.edges.map((edge, index) => ({
    data: {
      id: edge.id || `edge-${index}`,
      source: edge.source,
      target: edge.target,
      relationship: edge.relationship,
      evidenceQuote: edge.evidenceQuote,
      sourceReference: edge.sourceReference,
      evidenceType: edge.evidenceType
    }
  }));

  return [...nodes, ...edges];
}

async function loadGraphFromUrl(path) {
  setStatus(`Loading ${path}...`);

  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Unable to load graph file: ${path}`);
  }

  const payload = await response.json();
  return loadGraphData(payload, path);
}

function loadGraphData(payload, sourceLabel = "custom file") {
  validateGraphPayload(payload);
  renderMetadata(payload.metadata);
  initializeCytoscape(toCytoscapeElements(payload.graph));
  resetDetails();
  setStatus(`Loaded ${sourceLabel}`);
}

function renderGraphList() {
  graphListEl.innerHTML = "";

  availableGraphs.forEach(graphFile => {
    const item = document.createElement("li");
    const button = document.createElement("button");

    button.type = "button";
    button.innerHTML = `<strong>${graphFile.label}</strong><span>${graphFile.description}</span>`;
    button.addEventListener("click", () => {
      loadGraphFromUrl(graphFile.path).catch(handleLoadError);
    });

    item.appendChild(button);
    graphListEl.appendChild(item);
  });
}

function handleLoadError(error) {
  console.error(error);
  setStatus(error.message, true);
  renderDetails("Load error", [
    { label: "Message", value: error.message }
  ]);
}

function setupDragAndDrop() {
  const dragEvents = ["dragenter", "dragover", "dragleave", "drop"];

  dragEvents.forEach(eventName => {
    window.addEventListener(eventName, event => {
      event.preventDefault();
      event.stopPropagation();
    });
  });

  window.addEventListener("dragenter", () => {
    dragDepth += 1;
    document.body.classList.add("drag-active");
  });

  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      document.body.classList.remove("drag-active");
    }
  });

  window.addEventListener("drop", async event => {
    document.body.classList.remove("drag-active");
    dragDepth = 0;

    const [file] = event.dataTransfer.files;
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      loadGraphData(payload, file.name);
    } catch (error) {
      handleLoadError(error);
    }
  });
}

function setupActions() {
  reloadDefaultBtn.addEventListener("click", () => {
    loadGraphFromUrl(DEFAULT_GRAPH_PATH).catch(handleLoadError);
  });
}

async function bootstrap() {
  renderGraphList();
  setupDragAndDrop();
  setupActions();

  if (typeof cytoscape === "undefined") {
    handleLoadError(new Error("Cytoscape.js failed to load. Check your internet connection or browser console."));
    return;
  }

  try {
    await loadGraphFromUrl(DEFAULT_GRAPH_PATH);
  } catch (error) {
    handleLoadError(error);
  }
}

bootstrap();
