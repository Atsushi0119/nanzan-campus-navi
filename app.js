
"use strict";

/* ==============================
   基本設定
============================== */

const STORAGE_KEY = "nanzanCampusClickRoutesV1";
const ADMIN_PASSWORD = "nanzan2026";
const MAP_WIDTH = 782;
const MAP_HEIGHT = 696;

const DEFAULT_NODES = [
  { id: "gate-main", name: "正門", x: 340, y: 550 },
  { id: "gate-west", name: "西門", x: 176, y: 379 },
  { id: "gate-north", name: "北門", x: 398, y: 293 },
  { id: "gate-yamate", name: "山手通り門", x: 638, y: 299 },
  { id: "junction-main", name: "正門側分岐点", x: 340, y: 500 },
  { id: "junction-center", name: "中央分岐点", x: 385, y: 405 },
  { id: "junction-west", name: "西側分岐点", x: 255, y: 385 },
  { id: "junction-north", name: "北側分岐点", x: 400, y: 335 },
  { id: "junction-east", name: "東側分岐点", x: 525, y: 390 },
  { id: "junction-yamate", name: "山手通り側分岐点", x: 610, y: 335 }
];

const GPS_ANCHORS = [
  { lat: 35.1473889, lon: 136.9630000, x: 340, y: 550 },
  { lat: 35.1483056, lon: 136.9608611, x: 176, y: 379 },
  { lat: 35.1513056, lon: 136.9614444, x: 398, y: 293 },
  { lat: 35.1502778, lon: 136.9656944, x: 638, y: 299 }
];

/* ==============================
   状態
============================== */

let nodes = [];
let edges = [];
let nextNodeNumber = 1;
let isAdmin = false;
let currentMode = "normal";
let selectedNodeId = null;
let pathSequence = [];
let pathCreatedNodeIds = [];
let currentRoute = [];
let currentGPS = null;
let gpsWatchId = null;
let gpsRouteRequested = false;

const $ = (id) => document.getElementById(id);

const mapSvg = $("mapSvg");
const edgeLayer = $("edgeLayer");
const routeLayer = $("routeLayer");
const nodeLayer = $("nodeLayer");
const currentLocationLayer = $("currentLocationLayer");
const adminPanel = $("adminPanel");
const adminLoginBtn = $("adminLoginBtn");
const pathModeBtn = $("pathModeBtn");
const pathControls = $("pathControls");
const pathStatus = $("pathStatus");
const undoPathBtn = $("undoPathBtn");
const finishPathBtn = $("finishPathBtn");
const cancelPathBtn = $("cancelPathBtn");
const addNodeBtn = $("addNodeBtn");
const renameNodeBtn = $("renameNodeBtn");
const deleteNodeBtn = $("deleteNodeBtn");
const startSelect = $("startSelect");
const goalSelect = $("goalSelect");
const routeBtn = $("routeBtn");
const gpsRouteBtn = $("gpsRouteBtn");
const gpsBtn = $("gpsBtn");
const gpsStatus = $("gpsStatus");
const gpsAccuracy = $("gpsAccuracy");
const mapMessage = $("mapMessage");
const routeResult = $("routeResult");
const modeBadge = $("modeBadge");
const nodeCount = $("nodeCount");
const nodeList = $("nodeList");

/* ==============================
   初期化・イベント
============================== */

function initialize() {
  loadData();
  renderAll();
  bindEvents();
  setMessage("地点を登録しました。管理者ログイン後に通路を設定できます。");
}

function bindEvents() {
  adminLoginBtn.addEventListener("click", toggleAdminLogin);
  pathModeBtn.addEventListener("click", startPathMode);
  undoPathBtn.addEventListener("click", undoPathPoint);
  finishPathBtn.addEventListener("click", finishPathMode);
  cancelPathBtn.addEventListener("click", cancelPathMode);
  addNodeBtn.addEventListener("click", startAddNodeMode);
  renameNodeBtn.addEventListener("click", renameSelectedNode);
  deleteNodeBtn.addEventListener("click", deleteSelectedNode);
  routeBtn.addEventListener("click", searchRoute);
  gpsRouteBtn.addEventListener("click", routeFromGPS);
  gpsBtn.addEventListener("click", toggleGPS);
  $("saveBtn").addEventListener("click", () => {
    if (saveData()) setMessage("設定を保存しました。");
  });
  $("exportBtn").addEventListener("click", exportJSON);
  $("importFile").addEventListener("change", importJSON);

  startSelect.addEventListener("change", () => {
    currentRoute = [];
    routeResult.textContent = "出発地と目的地を選択してください。";
    renderAll();
  });

  goalSelect.addEventListener("change", () => {
    currentRoute = [];
    routeResult.textContent = "出発地と目的地を選択してください。";
    renderAll();
  });

  mapSvg.addEventListener("click", handleMapClick);

  $("campusMap").addEventListener("error", () => {
    setMessage("campusmap.pngを同じフォルダに置いてください。");
  });
}

/* ==============================
   保存・読み込み
============================== */

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      nodes = DEFAULT_NODES.map((node) => ({ ...node }));
      edges = [];
      nextNodeNumber = 1;
      return;
    }

    const data = JSON.parse(raw);

    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
      throw new Error("保存データの形式が正しくありません。");
    }

    nodes = data.nodes
      .filter((node) =>
        node &&
        typeof node.id === "string" &&
        typeof node.name === "string" &&
        Number.isFinite(Number(node.x)) &&
        Number.isFinite(Number(node.y))
      )
      .map((node) => ({
        id: node.id,
        name: node.name,
        x: clamp(Number(node.x), 0, MAP_WIDTH),
        y: clamp(Number(node.y), 0, MAP_HEIGHT)
      }));

    const ids = new Set(nodes.map((node) => node.id));

    edges = data.edges
      .filter((edge) =>
        edge &&
        ids.has(edge.from) &&
        ids.has(edge.to) &&
        edge.from !== edge.to
      )
      .map((edge) => ({ from: edge.from, to: edge.to }));

    nextNodeNumber = Number.isInteger(data.nextNodeNumber)
      ? data.nextNodeNumber
      : 1;

    // 古い保存データに存在しない初期地点だけを追加する。
    DEFAULT_NODES.forEach((defaultNode) => {
      if (!nodes.some((node) => node.id === defaultNode.id)) {
        nodes.push({ ...defaultNode });
      }
    });
  } catch (error) {
    console.error(error);
    nodes = DEFAULT_NODES.map((node) => ({ ...node }));
    edges = [];
    nextNodeNumber = 1;
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 3,
      nodes,
      edges,
      nextNodeNumber
    }));
    return true;
  } catch (error) {
    console.error(error);
    setMessage("保存に失敗しました。ブラウザの保存容量を確認してください。");
    return false;
  }
}

/* ==============================
   管理者ログイン
============================== */

function toggleAdminLogin() {
  if (isAdmin) {
    if (currentMode !== "normal") cancelPathMode();

    isAdmin = false;
    currentMode = "normal";
    selectedNodeId = null;
    adminPanel.classList.add("hidden");
    adminLoginBtn.textContent = "管理者ログイン";

    updateModeUI();
    renderAll();
    setMessage("ログアウトしました。");
    return;
  }

  const password = prompt("管理者パスワードを入力してください。");
  if (password === null) return;

  if (password !== ADMIN_PASSWORD) {
    alert("パスワードが違います。");
    return;
  }

  isAdmin = true;
  adminPanel.classList.remove("hidden");
  adminLoginBtn.textContent = "ログアウト";

  updateModeUI();
  renderAll();
  setMessage("管理者としてログインしました。");
}

/* ==============================
   通路の登録
============================== */

function startPathMode() {
  if (!requireAdmin()) return;

  currentMode = "path";
  pathSequence = [];
  pathCreatedNodeIds = [];
  selectedNodeId = null;
  currentRoute = [];

  pathControls.classList.remove("hidden");
  pathModeBtn.textContent = "通路設定中";
  pathModeBtn.disabled = true;

  updateModeUI();
  updatePathStatus();
  renderAll();
  setMessage("道の上にある地点を順番にクリックしてください。");
}

function handleMapClick(event) {
  if (!isAdmin) return;
  if (!["path", "addNode"].includes(currentMode)) return;

  const point = getMapPoint(event);
  if (!point) return;

  if (currentMode === "path") {
    handlePathPoint(point);
    return;
  }

  if (currentMode === "addNode") {
    const node = createNodeAt(point.x, point.y);
    selectedNodeId = node.id;
    currentMode = "normal";

    const name = prompt("地点名を入力してください。", node.name);
    if (name !== null && name.trim()) node.name = name.trim();

    saveData();
    updateModeUI();
    renderAll();
    setMessage(`地点「${node.name}」を追加しました。`);
  }
}

function handlePathPoint(point) {
  let node = findNodeNear(point.x, point.y, 18);

  if (!node) {
    node = createNodeAt(point.x, point.y);
    pathCreatedNodeIds.push(node.id);
  }

  const previousId = pathSequence[pathSequence.length - 1];

  if (previousId === node.id) {
    setMessage("同じ地点です。別の地点をクリックしてください。");
    return;
  }

  if (previousId) addEdge(previousId, node.id);

  pathSequence.push(node.id);
  updatePathStatus();
  renderAll();
  setMessage(`「${node.name}」を登録しました。続けて次の地点をクリックしてください。`);
}

function updatePathStatus() {
  const count = pathSequence.length;

  if (count === 0) {
    pathStatus.textContent = "最初の地点をクリックしてください。";
  } else {
    const first = getNode(pathSequence[0]);
    const last = getNode(pathSequence[count - 1]);
    pathStatus.textContent =
      `${count}地点登録中：${first?.name || ""} → ${last?.name || ""}`;
  }

  undoPathBtn.disabled = count === 0;
  finishPathBtn.disabled = count < 2;
}

function undoPathPoint() {
  if (currentMode !== "path" || pathSequence.length === 0) return;

  const removedId = pathSequence.pop();
  const previousId = pathSequence[pathSequence.length - 1];

  if (previousId) removeEdge(previousId, removedId);

  const isCreatedNow = pathCreatedNodeIds.includes(removedId);
  const stillConnected = edges.some((edge) =>
    edge.from === removedId || edge.to === removedId
  );

  if (isCreatedNow && !stillConnected) {
    nodes = nodes.filter((node) => node.id !== removedId);
    pathCreatedNodeIds = pathCreatedNodeIds.filter((id) => id !== removedId);
  }

  saveData();
  updatePathStatus();
  renderAll();
  setMessage("直前の地点を取り消しました。");
}

function finishPathMode() {
  if (currentMode !== "path") return;

  if (pathSequence.length < 2) {
    alert("2地点以上クリックしてください。");
    return;
  }

  const count = pathSequence.length;
  currentMode = "normal";
  pathSequence = [];
  pathCreatedNodeIds = [];

  pathControls.classList.add("hidden");
  pathModeBtn.textContent = "通路を設定";
  pathModeBtn.disabled = false;

  updateModeUI();
  saveData();
  renderAll();
  setMessage(`${count}地点を通路として登録しました。`);
}

function cancelPathMode() {
  currentMode = "normal";
  pathSequence = [];
  pathCreatedNodeIds = [];

  pathControls.classList.add("hidden");
  pathModeBtn.textContent = "通路を設定";
  pathModeBtn.disabled = false;

  updateModeUI();
  renderAll();
  setMessage("通路設定を終了しました。");
}

/* ==============================
   地点の管理
============================== */

function startAddNodeMode() {
  if (!requireAdmin()) return;
  if (currentMode === "path") cancelPathMode();

  currentMode = "addNode";
  selectedNodeId = null;

  updateModeUI();
  renderAll();
  setMessage("地点を追加する場所を地図上でクリックしてください。");
}

function createNodeAt(x, y) {
  const node = {
    id: `node-${Date.now()}-${nextNodeNumber}`,
    name: `地点${nextNodeNumber}`,
    x: clamp(x, 0, MAP_WIDTH),
    y: clamp(y, 0, MAP_HEIGHT)
  };

  nextNodeNumber++;
  nodes.push(node);
  return node;
}

function renameSelectedNode() {
  if (!requireAdmin()) return;

  if (!selectedNodeId) {
    alert("地図または地点一覧から地点を選択してください。");
    return;
  }

  const node = getNode(selectedNodeId);
  if (!node) return;

  const name = prompt("新しい地点名を入力してください。", node.name);
  if (name === null) return;

  if (!name.trim()) {
    alert("地点名を入力してください。");
    return;
  }

  node.name = name.trim();
  saveData();
  renderAll();
  setMessage(`地点名を「${node.name}」に変更しました。`);
}

function deleteSelectedNode() {
  if (!requireAdmin()) return;

  if (!selectedNodeId) {
    alert("削除する地点を選択してください。");
    return;
  }

  const node = getNode(selectedNodeId);
  if (!node) return;

  if (!confirm(`「${node.name}」を削除しますか？接続している通路も削除されます。`)) {
    return;
  }

  nodes = nodes.filter((item) => item.id !== selectedNodeId);
  edges = edges.filter((edge) =>
    edge.from !== selectedNodeId && edge.to !== selectedNodeId
  );

  pathSequence = pathSequence.filter((id) => id !== selectedNodeId);
  currentRoute = [];
  selectedNodeId = null;

  saveData();
  renderAll();
  setMessage("地点と接続していた通路を削除しました。");
}

/* ==============================
   地図の描画
============================== */

function renderAll() {
  renderEdges();
  renderRoute();
  renderNodes();
  renderCurrentLocation();
  renderSelects();
  renderNodeList();

  // 管理者専用の凡例をログイン状態に合わせる。
  const normalLegendItem = $("normalLegendItem");
  const pathLegendItem = $("pathLegendItem");

  if (normalLegendItem) {
    normalLegendItem.classList.toggle("hidden", !isAdmin);
  }
  if (pathLegendItem) {
    pathLegendItem.classList.toggle("hidden", !isAdmin);
  }
}

function renderEdges() {
  edgeLayer.replaceChildren();

  // 利用者には登録済みの全通路を見せず、検索ルートだけを表示する。
  if (!isAdmin) return;

  edges.forEach((edge) => {
    const from = getNode(edge.from);
    const to = getNode(edge.to);
    if (!from || !to) return;

    edgeLayer.appendChild(createSvgElement("line", {
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      class: "edge"
    }));
  });
}

function renderRoute() {
  routeLayer.replaceChildren();

  for (let i = 0; i < currentRoute.length - 1; i++) {
    const from = getNode(currentRoute[i]);
    const to = getNode(currentRoute[i + 1]);
    if (!from || !to) continue;

    routeLayer.appendChild(createSvgElement("line", {
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      class: "route-edge"
    }));
  }
}

function renderNodes() {
  nodeLayer.replaceChildren();

  // 管理者は全地点、利用者は出発地と目的地だけ。
  const visibleNodes = isAdmin
    ? nodes
    : nodes.filter((node) =>
        node.id === startSelect.value ||
        node.id === goalSelect.value
      );

  visibleNodes.forEach((node) => {
    const group = createSvgElement("g", {
      class: getNodeClass(node),
      transform: `translate(${node.x}, ${node.y})`
    });

    group.appendChild(createSvgElement("circle", { r: 7 }));

    const label = createSvgElement("text", {
      x: 0,
      y: -12
    });

    label.textContent = node.name;
    group.appendChild(label);

    group.addEventListener("click", (event) => {
      event.stopPropagation();
      handleNodeClick(node);
    });

    nodeLayer.appendChild(group);
  });
}

function renderCurrentLocation() {
  currentLocationLayer.replaceChildren();
  if (!currentGPS) return;

  const point = gpsToImage(currentGPS.lat, currentGPS.lon);

  if (
    point.x < 0 || point.x > MAP_WIDTH ||
    point.y < 0 || point.y > MAP_HEIGHT
  ) return;

  currentLocationLayer.appendChild(createSvgElement("circle", {
    cx: point.x,
    cy: point.y,
    r: 16,
    class: "current-pulse"
  }));

  currentLocationLayer.appendChild(createSvgElement("circle", {
    cx: point.x,
    cy: point.y,
    r: 6,
    class: "current-marker"
  }));
}

function renderSelects() {
  const oldStart = startSelect.value;
  const oldGoal = goalSelect.value;

  startSelect.replaceChildren();
  goalSelect.replaceChildren();

  addOption(startSelect, "", "出発地を選択");
  addOption(goalSelect, "", "目的地を選択");

  nodes.forEach((node) => {
    addOption(startSelect, node.id, node.name);
    addOption(goalSelect, node.id, node.name);
  });

  if (nodes.some((node) => node.id === oldStart)) {
    startSelect.value = oldStart;
  }

  if (nodes.some((node) => node.id === oldGoal)) {
    goalSelect.value = oldGoal;
  }
}

function addOption(select, value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  select.appendChild(option);
}

function renderNodeList() {
  nodeCount.textContent = `登録地点：${nodes.length}件`;
  nodeList.replaceChildren();

  // 地点一覧は管理者パネル内にのみ表示する。
  nodes.forEach((node) => {
    const row = document.createElement("div");
    row.className = "node-list-item";

    if (node.id === selectedNodeId) {
      row.classList.add("selected");
    }

    const name = document.createElement("span");
    name.textContent = node.name;

    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent = "選択";

    button.addEventListener("click", () => {
      selectedNodeId = node.id;
      renderAll();
      setMessage(`「${node.name}」を選択しました。`);
    });

    row.append(name, button);

    row.addEventListener("click", () => {
      selectedNodeId = node.id;
      renderAll();
    });

    nodeList.appendChild(row);
  });
}

function getNodeClass(node) {
  const classes = ["node"];

  if (node.id === selectedNodeId) classes.push("selected");
  if (pathSequence.includes(node.id)) classes.push("path-selected");

  if (currentRoute.length && currentRoute[0] === node.id) {
    classes.push("start-node");
  }

  if (
    currentRoute.length &&
    currentRoute[currentRoute.length - 1] === node.id
  ) {
    classes.push("goal-node");
  }

  return classes.join(" ");
}

function createSvgElement(tag, attributes = {}) {
  const element = document.createElementNS(
    "http://www.w3.org/2000/svg",
    tag
  );

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });

  return element;
}

/* ==============================
   地点選択・座標取得
============================== */

function handleNodeClick(node) {
  if (currentMode === "path") {
    handlePathPoint({ x: node.x, y: node.y });
    return;
  }

  if (currentMode === "addNode") {
    setMessage("新しい地点は地図上の空いている場所をクリックして追加してください。");
    return;
  }

  if (isAdmin) {
    selectedNodeId = node.id;
    renderAll();
    setMessage(`「${node.name}」を選択しました。`);
  }
}

function getMapPoint(event) {
  const rect = mapSvg.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  return {
    x: clamp((event.clientX - rect.left) / rect.width * MAP_WIDTH, 0, MAP_WIDTH),
    y: clamp((event.clientY - rect.top) / rect.height * MAP_HEIGHT, 0, MAP_HEIGHT)
  };
}

function findNodeNear(x, y, radius = 18) {
  let closest = null;
  let closestDistance = radius;

  nodes.forEach((node) => {
    const distance = Math.hypot(node.x - x, node.y - y);

    if (distance <= closestDistance) {
      closest = node;
      closestDistance = distance;
    }
  });

  return closest;
}

/* ==============================
   最短ルート検索
============================== */

function searchRoute() {
  const startId = startSelect.value;
  const goalId = goalSelect.value;

  if (!startId || !goalId) {
    alert("出発地と目的地を選択してください。");
    return;
  }

  if (startId === goalId) {
    currentRoute = [startId];
    renderAll();
    routeResult.textContent = "出発地と目的地が同じ地点です。";
    return;
  }

  const route = findShortestPath(startId, goalId);

  if (!route) {
    currentRoute = [];
    renderAll();
    routeResult.textContent =
      "ルートが見つかりません。通路設定で地点同士を接続してください。";
    return;
  }

  currentRoute = route;
  renderAll();

  const names = route.map((id) => getNode(id)?.name || id);
  routeResult.textContent =
    `ルート：${names.join(" → ")}（${route.length - 1}区間）`;

  setMessage("ルートを表示しました。");
}

function findShortestPath(startId, goalId) {
  const distance = new Map();
  const previous = new Map();
  const unvisited = new Set(nodes.map((node) => node.id));

  nodes.forEach((node) => distance.set(node.id, Infinity));
  distance.set(startId, 0);

  while (unvisited.size > 0) {
    let currentId = null;
    let currentDistance = Infinity;

    for (const id of unvisited) {
      const d = distance.get(id);
      if (d < currentDistance) {
        currentDistance = d;
        currentId = id;
      }
    }

    if (currentId === null || currentDistance === Infinity) break;
    if (currentId === goalId) break;

    unvisited.delete(currentId);

    const currentNode = getNode(currentId);
    if (!currentNode) continue;

    edges.forEach((edge) => {
      let neighborId = null;

      if (edge.from === currentId) neighborId = edge.to;
      if (edge.to === currentId) neighborId = edge.from;

      if (!neighborId || !unvisited.has(neighborId)) return;

      const neighbor = getNode(neighborId);
      if (!neighbor) return;

      const length = Math.hypot(
        neighbor.x - currentNode.x,
        neighbor.y - currentNode.y
      );

      const candidate = currentDistance + length;

      if (candidate < distance.get(neighborId)) {
        distance.set(neighborId, candidate);
        previous.set(neighborId, currentId);
      }
    });
  }

  if (distance.get(goalId) === Infinity) return null;

  const path = [];
  let currentId = goalId;

  while (currentId) {
    path.unshift(currentId);
    if (currentId === startId) break;
    currentId = previous.get(currentId);
  }

  return path[0] === startId ? path : null;
}

/* ==============================
   GPS
============================== */

function toggleGPS() {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    gpsBtn.textContent = "現在地を取得";
    gpsStatus.textContent = "現在地の更新を停止しました。";
    return;
  }

  if (!navigator.geolocation) {
    gpsStatus.textContent = "このブラウザでは現在地取得に対応していません。";
    return;
  }

  gpsStatus.textContent = "現在地を取得しています…";
  gpsBtn.textContent = "現在地の更新を停止";

  gpsWatchId = navigator.geolocation.watchPosition(
    (position) => updateGPS(position),
    (error) => {
      showGPSError(error);

      if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
      }

      gpsBtn.textContent = "現在地を取得";
    },
    {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 15000
    }
  );
}

function updateGPS(position) {
  currentGPS = {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy: position.coords.accuracy
  };

  gpsStatus.textContent =
    `現在地を取得しました（${currentGPS.lat.toFixed(6)}, ${currentGPS.lon.toFixed(6)}）`;

  gpsAccuracy.textContent =
    `位置情報の誤差：約${Math.round(currentGPS.accuracy)}m`;

  renderCurrentLocation();

  if (gpsRouteRequested) {
    gpsRouteRequested = false;
    routeFromCurrentGPS();
  }
}

function showGPSError(error) {
  const messages = {
    1: "位置情報の利用が拒否されました。ブラウザ設定を確認してください。",
    2: "現在地を取得できません。電波や位置情報設定を確認してください。",
    3: "取得がタイムアウトしました。もう一度お試しください。"
  };

  gpsStatus.textContent =
    messages[error.code] || "現在地の取得に失敗しました。";
}

function routeFromGPS() {
  if (!goalSelect.value) {
    alert("目的地を選択してください。");
    return;
  }

  if (currentGPS) {
    routeFromCurrentGPS();
    return;
  }

  if (!navigator.geolocation) {
    gpsStatus.textContent = "このブラウザでは現在地取得に対応していません。";
    return;
  }

  gpsRouteRequested = true;
  gpsStatus.textContent = "現在地を取得しています…";

  navigator.geolocation.getCurrentPosition(
    (position) => updateGPS(position),
    (error) => {
      gpsRouteRequested = false;
      showGPSError(error);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 15000
    }
  );
}

function routeFromCurrentGPS() {
  const goalId = goalSelect.value;
  if (!goalId || !currentGPS) return;

  const point = gpsToImage(currentGPS.lat, currentGPS.lon);
  const nearest = findNearestNode(point.x, point.y);

  if (!nearest) {
    routeResult.textContent = "先に地点を登録してください。";
    return;
  }

  startSelect.value = nearest.id;
  searchRoute();
  setMessage(`現在地に近い地点「${nearest.name}」からルートを検索しました。`);
}

function findNearestNode(x, y) {
  let closest = null;
  let minDistance = Infinity;

  nodes.forEach((node) => {
    const distance = Math.hypot(node.x - x, node.y - y);

    if (distance < minDistance) {
      minDistance = distance;
      closest = node;
    }
  });

  return closest;
}

function gpsToImage(lat, lon) {
  const refLat = GPS_ANCHORS[0].lat;
  const refLon = GPS_ANCHORS[0].lon;

  const converted = GPS_ANCHORS.map((anchor) => ({
    gx: (anchor.lon - refLon) * 111320 *
      Math.cos(refLat * Math.PI / 180),
    gy: (anchor.lat - refLat) * 111320,
    x: anchor.x,
    y: anchor.y
  }));

  const targetX = (lon - refLon) * 111320 *
    Math.cos(refLat * Math.PI / 180);
  const targetY = (lat - refLat) * 111320;

  const tx = fitPlane(converted, "x");
  const ty = fitPlane(converted, "y");

  return {
    x: tx.a * targetX + tx.b * targetY + tx.c,
    y: ty.a * targetX + ty.b * targetY + ty.c
  };
}

function fitPlane(points, targetKey) {
  let sxx = 0, syy = 0, sxy = 0;
  let sx = 0, sy = 0, sz = 0;
  let sxz = 0, syz = 0;
  const n = points.length;

  points.forEach((point) => {
    const x = point.gx;
    const y = point.gy;
    const z = point[targetKey];

    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    sx += x;
    sy += y;
    sz += z;
    sxz += x * z;
    syz += y * z;
  });

  const matrix = [
    [sxx, sxy, sx, sxz],
    [sxy, syy, sy, syz],
    [sx, sy, n, sz]
  ];

  for (let i = 0; i < 3; i++) {
    let pivot = i;

    for (let j = i + 1; j < 3; j++) {
      if (Math.abs(matrix[j][i]) > Math.abs(matrix[pivot][i])) {
        pivot = j;
      }
    }

    [matrix[i], matrix[pivot]] = [matrix[pivot], matrix[i]];

    const divisor = matrix[i][i];

    if (Math.abs(divisor) < 1e-12) {
      return { a: 0, b: 0, c: 0 };
    }

    for (let k = i; k < 4; k++) matrix[i][k] /= divisor;

    for (let j = 0; j < 3; j++) {
      if (j === i) continue;

      const factor = matrix[j][i];

      for (let k = i; k < 4; k++) {
        matrix[j][k] -= factor * matrix[i][k];
      }
    }
  }

  return {
    a: matrix[0][3],
    b: matrix[1][3],
    c: matrix[2][3]
  };
}

/* ==============================
   JSONの書き出し・読み込み
============================== */

function exportJSON() {
  const blob = new Blob(
    [JSON.stringify({ version: 3, nodes, edges, nextNodeNumber }, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "nanzan-campus-routes.json";
  link.click();

  URL.revokeObjectURL(url);
  setMessage("JSONを書き出しました。");
}

function importJSON(event) {
  if (!requireAdmin()) {
    event.target.value = "";
    return;
  }

  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));

      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
        throw new Error("地点または通路データがありません。");
      }

      const ids = new Set();

      for (const node of data.nodes) {
        if (
          !node ||
          typeof node.id !== "string" ||
          typeof node.name !== "string" ||
          !Number.isFinite(Number(node.x)) ||
          !Number.isFinite(Number(node.y)) ||
          ids.has(node.id)
        ) {
          throw new Error("地点データが正しくありません。");
        }

        ids.add(node.id);
      }

      for (const edge of data.edges) {
        if (
          !edge ||
          !ids.has(edge.from) ||
          !ids.has(edge.to) ||
          edge.from === edge.to
        ) {
          throw new Error("通路データが正しくありません。");
        }
      }

      if (!confirm("現在の地点と通路を読み込むデータに置き換えますか？")) {
        return;
      }

      nodes = data.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        x: clamp(Number(node.x), 0, MAP_WIDTH),
        y: clamp(Number(node.y), 0, MAP_HEIGHT)
      }));

      edges = data.edges.map((edge) => ({
        from: edge.from,
        to: edge.to
      }));

      nextNodeNumber = Number.isInteger(data.nextNodeNumber)
        ? data.nextNodeNumber
        : 1;

      currentRoute = [];
      selectedNodeId = null;
      pathSequence = [];
      pathCreatedNodeIds = [];

      saveData();
      renderAll();
      setMessage("JSONを読み込みました。");
    } catch (error) {
      console.error(error);
      alert(`JSONの読み込みに失敗しました。\n${error.message}`);
    } finally {
      event.target.value = "";
    }
  };

  reader.onerror = () => {
    alert("ファイルを読み込めませんでした。");
    event.target.value = "";
  };

  reader.readAsText(file);
}

/* ==============================
   共通関数
============================== */

function getNode(id) {
  return nodes.find((node) => node.id === id) || null;
}

function removeEdge(from, to) {
  edges = edges.filter((edge) => !(
    (edge.from === from && edge.to === to) ||
    (edge.from === to && edge.to === from)
  ));
}

function addEdge(from, to) {
  if (!from || !to || from === to) return;

  const exists = edges.some((edge) =>
    (edge.from === from && edge.to === to) ||
    (edge.from === to && edge.to === from)
  );

  if (!exists) edges.push({ from, to });
}

function requireAdmin() {
  if (!isAdmin) {
    alert("先に管理者ログインしてください。");
    return false;
  }

  return true;
}

function updateModeUI() {
  mapSvg.classList.toggle("path-mode", currentMode === "path");

  if (currentMode === "path") {
    modeBadge.textContent = "通路設定中";
    modeBadge.classList.add("active");
  } else if (currentMode === "addNode") {
    modeBadge.textContent = "地点追加中";
    modeBadge.classList.add("active");
  } else {
    modeBadge.textContent = isAdmin ? "管理者モード" : "通常モード";
    modeBadge.classList.toggle("active", isAdmin);
  }
}

function setMessage(message) {
  mapMessage.textContent = message;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

initialize();
