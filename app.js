const STANDARD_OPTIONS = [
  {
    id: "2018",
    label: "ISO 19650 (2018)",
    graphFiles: [
      "graphs/2018/core-system.json",
      "graphs/2018/requirements-hierarchy.json"
    ]
  },
  {
    id: "draft",
    label: "ISO 19650 (Draft)",
    graphFiles: [
      "graphs/draft/core-system.json",
      "graphs/draft/requirements-hierarchy.json"
    ]
  }
];

const DEFAULT_STANDARD_ID = "draft";

const standardSelectEl = document.getElementById("standardSelect");
const graphSelectEl = document.getElementById("graphSelect");
const graphNameEl = document.getElementById("graphName");
const graphDescriptionEl = document.getElementById("graphDescription");
const graphVersionEl = document.getElementById("graphVersion");
const graphStandardEl = document.getElementById("graphStandard");
const graphTagsEl = document.getElementById("graphTags");
const graphStatusEl = document.getElementById("graphStatus");
const selectionTypeEl = document.getElementById("selectionType");
const detailsListEl = document.getElementById("detailsList");
const reloadDefaultBtn = document.getElementById("reloadDefaultBtn");

let cy;
let dragDepth = 0;
let activeStandardId = DEFAULT_STANDARD_ID;
let activeGraphFile = "";
const metadataCache = new Map();

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

function renderMetadata(metadata = {}) {
  graphNameEl.textContent = metadata.name || "Untitled Graph";
  graphDescriptionEl.textContent = metadata.description || "-";
  graphVersionEl.textContent = metadata.version || "-";
  graphStandardEl.textContent = metadata.standard || "-";
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
          label: "data(label)",
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
      label: edge.label || edge.relationship,
      evidenceQuote: edge.evidence?.quote || edge.evidenceQuote,
      sourceReference: edge.evidence?.source || edge.sourceReference,
      evidenceType: edge.evidence?.type || edge.evidenceType
    }
  }));

  return [...nodes, ...edges];
}

async function fetchGraphJson(file) {
  const response = await fetch(file);
  if (!response.ok) {
    throw new Error(`Unable to load graph file: ${file}`);
  }

  return response.json();
}

async function fetchGraphMetadata(file) {
  if (metadataCache.has(file)) {
    return metadataCache.get(file);
  }

  const payload = await fetchGraphJson(file);
  validateGraphPayload(payload);

  const entry = {
    file,
    metadata: payload.metadata
  };

  metadataCache.set(file, entry);
  return entry;
}

function loadStandards() {
  standardSelectEl.innerHTML = "";

  STANDARD_OPTIONS.forEach(standard => {
    const option = document.createElement("option");
    option.value = standard.id;
    option.textContent = standard.label;
    standardSelectEl.appendChild(option);
  });

  standardSelectEl.value = DEFAULT_STANDARD_ID;
}

async function loadGraphList(standardId) {
  activeStandardId = standardId;
  graphSelectEl.innerHTML = "";

  const standard = STANDARD_OPTIONS.find(item => item.id === standardId);
  if (!standard) {
    throw new Error(`Unknown standard: ${standardId}`);
  }

  setStatus(`Loading graphs for ${standard.label}...`);

  const entries = await Promise.all(standard.graphFiles.map(fetchGraphMetadata));

  entries.forEach(entry => {
    const option = document.createElement("option");
    option.value = entry.file;
    option.textContent = entry.metadata.name || entry.file;
    graphSelectEl.appendChild(option);
  });

  if (entries.length === 0) {
    activeGraphFile = "";
    renderMetadata();
    resetDetails();
    setStatus(`No graphs available for ${standard.label}`, true);
    return;
  }

  graphSelectEl.value = entries[0].file;
  activeGraphFile = entries[0].file;
  await loadGraphFromFile(activeGraphFile);
}

function renderGraph(graphData) {
  initializeCytoscape(toCytoscapeElements(graphData));
  resetDetails();
}

function loadGraph(graphData, sourceLabel = "custom file") {
  validateGraphPayload(graphData);
  renderMetadata(graphData.metadata);
  renderGraph(graphData.graph);
  setStatus(`Loaded ${sourceLabel}`);
}

async function loadGraphFromFile(file) {
  activeGraphFile = file;
  setStatus(`Loading ${file}...`);
  const payload = await fetchGraphJson(file);
  loadGraph(payload, file);
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
      loadGraph(payload, file.name);
    } catch (error) {
      handleLoadError(error);
    }
  });
}

function setupActions() {
  standardSelectEl.addEventListener("change", async event => {
    try {
      await loadGraphList(event.target.value);
    } catch (error) {
      handleLoadError(error);
    }
  });

  graphSelectEl.addEventListener("change", async event => {
    try {
      await loadGraphFromFile(event.target.value);
    } catch (error) {
      handleLoadError(error);
    }
  });

  reloadDefaultBtn.addEventListener("click", () => {
    const file = activeGraphFile;

    if (!file) {
      loadGraphList(activeStandardId).catch(handleLoadError);
      return;
    }

    loadGraphFromFile(file).catch(handleLoadError);
  });
}

async function bootstrap() {
  loadStandards();
  setupDragAndDrop();
  setupActions();

  if (typeof cytoscape === "undefined") {
    handleLoadError(new Error("Cytoscape.js failed to load. Check your internet connection or browser console."));
    return;
  }

  try {
    await loadGraphList(DEFAULT_STANDARD_ID);
  } catch (error) {
    handleLoadError(error);
  }
}

bootstrap();
