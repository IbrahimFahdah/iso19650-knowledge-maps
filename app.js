const STANDARD_OPTIONS = [
  {
    id: "2018",
    label: "ISO 19650 (2018)",
    manifest: "graphs/2018/index.json"
  },
  {
    id: "draft",
    label: "ISO 19650 (Draft)",
    manifest: "graphs/draft/index.json"
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
const graphStatsEl = document.getElementById("graphStats");
const activeGraphBadgeEl = document.getElementById("activeGraphBadge");
const selectionHeadingEl = document.getElementById("selectionHeading");
const selectionTypeEl = document.getElementById("selectionType");
const detailsListEl = document.getElementById("detailsList");
const resetViewBtn = document.getElementById("resetViewBtn");

let cy;
let dragDepth = 0;
let activeStandardId = DEFAULT_STANDARD_ID;
let activeGraphFile = "";
let suppressViewStateSave = false;
const STORAGE_PREFIX = "iso19650:view:";

function buildNoCacheUrl(file) {
  const separator = file.includes("?") ? "&" : "?";
  return `${file}${separator}_=${Date.now()}`;
}

function getGraphStorageKey() {
  if (!activeGraphFile) {
    return null;
  }

  return `${STORAGE_PREFIX}${activeGraphFile}`;
}

function saveGraphViewState() {
  if (!cy || suppressViewStateSave) {
    return;
  }

  const storageKey = getGraphStorageKey();
  if (!storageKey) {
    return;
  }

  const nodePositions = {};
  cy.nodes().forEach(node => {
    nodePositions[node.id()] = node.position();
  });

  const state = {
    zoom: cy.zoom(),
    pan: cy.pan(),
    nodePositions
  };

  localStorage.setItem(storageKey, JSON.stringify(state));
}

function loadGraphViewState() {
  const storageKey = getGraphStorageKey();
  if (!storageKey) {
    return null;
  }

  const rawState = localStorage.getItem(storageKey);
  if (!rawState) {
    return null;
  }

  try {
    return JSON.parse(rawState);
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
}

function clearGraphViewState() {
  const storageKey = getGraphStorageKey();
  if (!storageKey) {
    return;
  }

  localStorage.removeItem(storageKey);
}

function restoreGraphViewState() {
  if (!cy) {
    return;
  }

  const savedState = loadGraphViewState();
  if (!savedState) {
    return;
  }

  if (savedState.nodePositions && typeof savedState.nodePositions === "object") {
    cy.nodes().forEach(node => {
      const savedPosition = savedState.nodePositions[node.id()];
      if (savedPosition && typeof savedPosition.x === "number" && typeof savedPosition.y === "number") {
        node.position(savedPosition);
      }
    });
  }

  if (savedState.pan && typeof savedState.pan.x === "number" && typeof savedState.pan.y === "number") {
    cy.pan(savedState.pan);
  }

  if (typeof savedState.zoom === "number") {
    cy.zoom(savedState.zoom);
  }
}

function formatLabel(value, fallback = "-") {
  if (!value) {
    return fallback;
  }

  if (typeof value !== "string") {
    return String(value);
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function setStatus(message, isError = false) {
  if (isError) {
    activeGraphBadgeEl.textContent = message;
    activeGraphBadgeEl.style.color = "#b91c1c";
    activeGraphBadgeEl.style.background = "rgba(185, 28, 28, 0.10)";
    return;
  }

  activeGraphBadgeEl.style.color = "";
  activeGraphBadgeEl.style.background = "";
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
  graphVersionEl.textContent = formatLabel(metadata.version);
  graphStandardEl.textContent = formatLabel(metadata.standard);
  graphTagsEl.textContent = Array.isArray(metadata.tags) && metadata.tags.length > 0
    ? metadata.tags.join(", ")
    : "-";
  graphStatsEl.textContent = metadata.graphStats || "-";
}

function renderActiveGraphBadge(metadata = {}) {
  activeGraphBadgeEl.style.color = "";
  activeGraphBadgeEl.style.background = "";

  const version = formatLabel(metadata.version, "Custom");
  const name = metadata.name || "Untitled Graph";
  activeGraphBadgeEl.textContent = `${version}.${name}`;
}

function renderDetails(title, fields) {
  selectionHeadingEl.textContent = title;
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
  renderDetails("Selection Details", [
    {
      label: "Node Hint",
      value: "Click a node to inspect concept details, role definitions, or process context."
    },
    {
      label: "Edge Hint",
      value: "Click an edge to inspect relationship evidence, source reference, and evidence type."
    }
  ]);
  selectionTypeEl.textContent = "Nothing selected";
}

function getNodeColor(type) {
  const colorMap = {
    concept: "#2563eb",
    role: "#16a34a",
    process: "#ea580c",
    information: "#9333ea",
    system: "#6b7280",
    state: "#0f172a"
  };

  return colorMap[type] || "#0f172a";
}

function initializeCytoscape(elements, usePresetLayout = false) {
  if (cy) {
    cy.destroy();
  }

  cy = cytoscape({
    container: document.getElementById("cy"),
    elements,
    layout: usePresetLayout
      ? { name: "preset", fit: true, padding: 24 }
      : { name: "cose", animate: true, fit: true, padding: 24 },
    style: [
      {
        selector: "node",
        style: {
          "background-color": ele => getNodeColor(ele.data("type")),
          label: "data(label)",
          color: "#10203a",
          "font-size": 10,
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

    renderDetails(`Node: ${node.data("label") || node.id()}`, [
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

    renderDetails(`Edge: ${edge.data("label") || edge.data("relationship") || edge.id()}`, [
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

  cy.on("dragfreeon", "node", () => {
    saveGraphViewState();
  });

  cy.on("zoom pan", () => {
    saveGraphViewState();
  });
}

function toCytoscapeElements(graph, savedState = null) {
  const nodes = graph.nodes.map(node => ({
    data: {
      id: node.id,
      label: node.label,
      type: node.type,
      description: node.description
    },
    position: savedState?.nodePositions?.[node.id]
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
  const response = await fetch(buildNoCacheUrl(file), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load graph file: ${file}`);
  }

  return response.json();
}

async function fetchGraphMetadata(file) {
  const payload = await fetchGraphJson(file);
  validateGraphPayload(payload);

  return {
    file,
    metadata: payload.metadata
  };
}

async function fetchManifest(manifestFile) {
  const response = await fetch(buildNoCacheUrl(manifestFile), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load graph manifest: ${manifestFile}`);
  }

  const manifest = await response.json();
  if (!Array.isArray(manifest.graphs)) {
    throw new Error(`Graph manifest must contain a 'graphs' array: ${manifestFile}`);
  }

  return manifest;
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

  const manifest = await fetchManifest(standard.manifest);
  const entries = await Promise.all(manifest.graphs.map(fetchGraphMetadata));

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

  const selectedIndex = Math.min(loadGraphList.preferredIndex ?? 0, entries.length - 1);
  const selectedEntry = entries[selectedIndex];

  graphSelectEl.value = selectedEntry.file;
  activeGraphFile = selectedEntry.file;
  await loadGraphFromFile(activeGraphFile);
}

function renderGraph(graphData) {
  const savedState = loadGraphViewState();
  suppressViewStateSave = true;
  initializeCytoscape(toCytoscapeElements(graphData, savedState), Boolean(savedState?.nodePositions));

  if (savedState) {
    restoreGraphViewState();
  }

  suppressViewStateSave = false;
  resetDetails();
}

function loadGraph(graphData, sourceLabel = "custom file") {
  validateGraphPayload(graphData);
  renderMetadata({
    ...graphData.metadata,
    graphStats: `${graphData.graph.nodes.length} nodes, ${graphData.graph.edges.length} edges`
  });
  renderActiveGraphBadge(graphData.metadata);
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
      const payload = JSON.parse(await file.text());
      loadGraph(payload, file.name);
    } catch (error) {
      handleLoadError(error);
    }
  });
}

function setupActions() {
  standardSelectEl.addEventListener("change", async event => {
    try {
      loadGraphList.preferredIndex = Math.max(graphSelectEl.selectedIndex, 0);
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

  resetViewBtn.addEventListener("click", () => {
    clearGraphViewState();

    if (!activeGraphFile) {
      return;
    }

    loadGraphFromFile(activeGraphFile).catch(handleLoadError);
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
