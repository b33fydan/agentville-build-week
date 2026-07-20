const PALETTE = Object.freeze({
  ink: "#17251d",
  sky: "#a8cec3",
  skyLight: "#f3e7b8",
  skyDeep: "#75a995",
  sun: "#f5bd3f",
  sunLight: "#ffe186",
  cloud: "#fff4d2",
  grassTop: "#78a94c",
  grassLeft: "#4e7837",
  grassRight: "#3b6231",
  grassAlt: "#8abb55",
  soilTop: "#925936",
  soilLeft: "#663b28",
  soilRight: "#4d2e23",
  pathTop: "#d5ad6d",
  pathLeft: "#936b45",
  pathRight: "#755039",
  water: "#329dbb",
  waterDeep: "#23748f",
  waterLight: "#8be7ea",
  channelDry: "#6c8179",
  stoneTop: "#7f8c72",
  stoneLeft: "#58644f",
  stoneRight: "#424e40",
  woodTop: "#c47b3c",
  woodLeft: "#874b2b",
  woodRight: "#653725",
  roofTop: "#d85b36",
  roofLeft: "#993a2c",
  roofRight: "#722b25",
  cropDry: "#b7863f",
  cropWet: "#438e42",
  tomato: "#ef5639",
  denimTop: "#4e9bb3",
  denimLeft: "#2f6e86",
  denimRight: "#245368",
  cyan: "#67d9e7",
  paper: "#fff4d6",
  storm: "#52677a",
  stormDeep: "#344756",
  rain: "#a8e5ed",
  seedling: "#58a34d",
  seedlingLight: "#91cf68",
  cover: "#bfe8df",
  grain: "#f3c84e",
  henWhite: "#f2ead5",
  henBrown: "#b9653b",
});

const MAP_WIDTH = 9;
const MAP_HEIGHT = 7;

export const IRRIGATION_SIGN = Object.freeze({
  id: "irrigation-sign",
  label: "IRRIGATION",
  pointsTo: "East Channel",
  position: Object.freeze({ x: 2.75, y: 2.45 }),
});

export const WEATHER_SIGN = Object.freeze({
  id: "weather-sign",
  label: "WEATHER",
  pointsTo: "Sky and storm vane",
  position: Object.freeze({ x: 1.72, y: 1.92 }),
});

export const FEEDER_SIGN = Object.freeze({
  id: "feeder-sign",
  label: "FEEDER",
  pointsTo: "Hen feeder and chute",
  position: Object.freeze({ x: 4.2, y: 3.85 }),
});

export const WORLD_LANDMARKS = Object.freeze({
  "east-channel": Object.freeze([IRRIGATION_SIGN]),
  "storm-watch": Object.freeze([WEATHER_SIGN]),
  "hungry-hens": Object.freeze([FEEDER_SIGN]),
});

export const WORLD_PRESENTATION = Object.freeze({
  style: "layered-voxel-farm",
  bertSilhouette: "humanoid-farmhand",
});

export class FarmRenderer {
  constructor(canvas, { onResize = null } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false });
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.tileWidth = 68;
    this.tileHeight = 34;
    this.unitZ = 30;
    this.originX = 0;
    this.originY = 0;
    this.reducedMotion = false;
    this.monoFont = getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || "monospace";
    this.frameStats = null;
    this.lastPresentation = null;
    this.onResize = typeof onResize === "function" ? onResize : null;
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.onResize?.();
    });
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  destroy() {
    this.resizeObserver.disconnect();
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.context.imageSmoothingEnabled = false;

    const horizontalFit = this.width / 11.2;
    const verticalFit = this.height / 11.6;
    this.tileWidth = clamp(Math.min(horizontalFit, verticalFit * 2), 52, 92);
    this.tileHeight = this.tileWidth * 0.5;
    this.unitZ = this.tileHeight * 0.9;
    this.originX = this.width * 0.53;
    this.originY = Math.max(this.height * 0.24, 112);
  }

  project(gridX, gridY, elevation = 0) {
    return {
      x: this.originX + (gridX - gridY) * (this.tileWidth / 2),
      y: this.originY + (gridX + gridY) * (this.tileHeight / 2) - elevation * this.unitZ,
    };
  }

  render(inputState = {}, timeMs = 0) {
    const state = normalizeState(inputState);
    const activeProps = propsForScene(state.sceneId);
    const activePropFamilies = [...new Set(activeProps.map((prop) => prop.type))].sort();
    const ctx = this.context;
    this.frameStats = {
      voxelCount: 0,
      terrainElevations: new Set(),
      propCount: activeProps.length,
      propFamilies: activePropFamilies,
      sceneId: state.sceneId,
      landmarks: landmarksForScene(state.sceneId),
      entities: sceneEntities(state),
      alignment: {
        channelSegments: [],
        fenceSegments: [],
      },
      bert: null,
    };
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackdrop(timeMs, state);
    this.drawFarmShadow();

    for (let depth = 0; depth <= MAP_WIDTH + MAP_HEIGHT - 2; depth += 1) {
      for (let y = 0; y < MAP_HEIGHT; y += 1) {
        const x = depth - y;
        if (x < 0 || x >= MAP_WIDTH) continue;
        this.drawGroundTile(x, y, state, timeMs);
      }
    }

    if (state.routeVisible && state.route.length > 1) this.drawRoute(state.route, timeMs);

    const props = [...activeProps, { type: "bert", x: state.bert.x, y: state.bert.y, depthOffset: 0.08, bert: state.bert }];
    props.sort((a, b) => a.x + a.y + (a.depthOffset ?? 0) - (b.x + b.y + (b.depthOffset ?? 0)));
    for (const prop of props) this.drawProp(prop, state, timeMs);

    this.drawSceneAtmosphere(state);
    this.drawForegroundVignette();
    this.lastPresentation = this.buildPresentationSnapshot();
  }

  getBertAnchor(bert) {
    const normalized = normalizeState({ bert }).bert;
    return this.project(normalized.x, normalized.y, 2.08);
  }

  presentationSnapshot() {
    return this.lastPresentation ? structuredClone(this.lastPresentation) : null;
  }

  buildPresentationSnapshot() {
    const corners = [
      this.project(-0.6, -0.4, 0),
      this.project(MAP_WIDTH - 0.2, -0.4, 0),
      this.project(MAP_WIDTH - 0.2, MAP_HEIGHT + 0.45, -0.58),
      this.project(-0.6, MAP_HEIGHT + 0.45, -0.58),
    ];
    return {
      style: WORLD_PRESENTATION.style,
      sceneId: this.frameStats?.sceneId ?? "east-channel",
      activePropFamilies: [...(this.frameStats?.propFamilies ?? [])],
      landmarks: {
        count: this.frameStats?.landmarks?.length ?? 0,
        items: structuredClone(this.frameStats?.landmarks ?? []),
      },
      entities: structuredClone(this.frameStats?.entities ?? { count: 0, byType: {}, state: {} }),
      farm: {
        grid: { width: MAP_WIDTH, height: MAP_HEIGHT },
        elevationLayers: this.frameStats?.terrainElevations?.size ?? 0,
        voxelCount: this.frameStats?.voxelCount ?? 0,
        propCount: this.frameStats?.propCount ?? 0,
        propFamilies: [...(this.frameStats?.propFamilies ?? [])],
        activePropFamilies: [...(this.frameStats?.propFamilies ?? [])],
        screenBounds: boundsForPoints(corners),
        gridAlignment: this.buildGridAlignmentSnapshot(),
      },
      bert: this.frameStats?.bert ? structuredClone(this.frameStats.bert) : null,
    };
  }

  buildGridAlignmentSnapshot() {
    const origin = this.project(0, 0, 0);
    const axes = {
      x: subtractPoints(this.project(1, 0, 0), origin),
      y: subtractPoints(this.project(0, 1, 0), origin),
    };
    return {
      axes: {
        x: roundPoint(axes.x),
        y: roundPoint(axes.y),
      },
      channel: summarizeProjectedSegments(this.frameStats?.alignment?.channelSegments ?? [], axes),
      fences: summarizeProjectedSegments(this.frameStats?.alignment?.fenceSegments ?? [], axes),
    };
  }

  drawBackdrop(timeMs, state) {
    const ctx = this.context;
    const stormWatch = state.sceneId === "storm-watch";
    const stormActive = stormWatch && (state.stormStage === "building" || state.stormStage === "raining");
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, stormActive ? "#c7c5aa" : PALETTE.skyLight);
    gradient.addColorStop(0.42, stormActive ? PALETTE.storm : PALETTE.sky);
    gradient.addColorStop(1, stormActive ? PALETTE.stormDeep : PALETTE.skyDeep);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    const sunX = this.width * 0.83;
    const sunY = this.height * 0.14;
    const sunSize = clamp(this.tileWidth * 0.82, 44, 58);
    if (!stormActive) {
      ctx.fillStyle = "rgba(245, 189, 63, 0.16)";
      ctx.fillRect(sunX - sunSize * 0.82, sunY - sunSize * 0.82, sunSize * 1.64, sunSize * 1.64);
      ctx.fillStyle = PALETTE.sun;
      ctx.fillRect(sunX - sunSize / 2, sunY - sunSize / 2, sunSize, sunSize);
      ctx.fillStyle = PALETTE.sunLight;
      ctx.fillRect(sunX - sunSize * 0.34, sunY - sunSize * 0.34, sunSize * 0.28, sunSize * 0.28);
    }

    const drift = this.reducedMotion ? 0 : Math.sin(timeMs / 9000) * 9;
    if (stormActive) {
      this.drawStormCloud(this.width * 0.76, this.height * 0.1, 1.18);
      this.drawStormCloud(this.width * 0.42, this.height * 0.16, 0.92);
      this.drawStormCloud(this.width * 0.12, this.height * 0.24, 0.66);
    } else {
      this.drawCloud(this.width * 0.58 + drift, this.height * 0.11, 0.85);
      this.drawCloud(this.width * 0.17 - drift * 0.5, this.height * 0.22, 0.58);
      if (stormWatch && state.stormStage === "cleared") {
        this.drawStormCloud(this.width * 0.08, this.height * 0.18, 0.5);
      }
    }

    this.drawDistantRidge(this.height * 0.48, "#71946b", 56, 0.018);
    this.drawDistantRidge(this.height * 0.55, "#587f60", 42, 0.024);
    this.drawPatchworkFields();
  }

  drawCloud(x, y, scale) {
    const ctx = this.context;
    const unit = Math.max(4, Math.round(8 * scale));
    ctx.fillStyle = "rgba(255, 244, 210, 0.86)";
    ctx.fillRect(x - unit * 5, y, unit * 10, unit * 2);
    ctx.fillRect(x - unit * 3, y - unit, unit * 6, unit * 3);
    ctx.fillRect(x - unit, y - unit * 2, unit * 3, unit * 3);
    ctx.fillStyle = "rgba(222, 231, 201, 0.55)";
    ctx.fillRect(x - unit * 4, y + unit * 2, unit * 8, unit * 0.65);
  }

  drawStormCloud(x, y, scale) {
    const ctx = this.context;
    const unit = Math.max(5, Math.round(9 * scale));
    ctx.fillStyle = "rgba(34, 52, 61, 0.24)";
    ctx.fillRect(x - unit * 5 + 5, y + unit * 1.2 + 5, unit * 10, unit * 2.2);
    ctx.fillStyle = "#657482";
    ctx.fillRect(x - unit * 5, y + unit, unit * 10, unit * 2);
    ctx.fillRect(x - unit * 3.5, y, unit * 6.5, unit * 3);
    ctx.fillRect(x - unit * 1.2, y - unit * 1.4, unit * 3.3, unit * 3.4);
    ctx.fillStyle = "#84919a";
    ctx.fillRect(x - unit * 3.8, y + unit * 0.25, unit * 2.6, unit * 0.75);
    ctx.fillStyle = "#394d59";
    ctx.fillRect(x - unit * 4.5, y + unit * 2.45, unit * 9, unit * 0.7);
  }

  drawSceneAtmosphere(state) {
    if (state.sceneId !== "storm-watch" || state.stormStage !== "raining") return;
    const ctx = this.context;
    ctx.save();
    ctx.strokeStyle = "rgba(168, 229, 237, 0.76)";
    ctx.lineWidth = Math.max(1.2, this.tileWidth / 52);
    ctx.lineCap = "square";
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 9; column += 1) {
        const x = 22 + column * (this.width - 44) / 8 + (row % 2) * 13;
        const y = 86 + row * (this.height - 150) / 5 + (column % 3) * 9;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 8, y + 18);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawDistantRidge(baseY, color, step, frequency) {
    const ctx = this.context;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, this.height);
    ctx.lineTo(0, baseY);
    for (let x = 0; x <= this.width + step; x += step) {
      const height = 22 + Math.abs(Math.sin(x * frequency)) * 42;
      const y = Math.round((baseY - height) / 7) * 7;
      ctx.lineTo(x, y);
      ctx.lineTo(Math.min(x + step, this.width + step), y);
    }
    ctx.lineTo(this.width, this.height);
    ctx.closePath();
    ctx.fill();
  }

  drawPatchworkFields() {
    const ctx = this.context;
    const horizon = this.height * 0.53;
    const colors = ["rgba(111, 151, 76, 0.34)", "rgba(210, 174, 97, 0.25)", "rgba(57, 113, 82, 0.25)"];
    for (let band = 0; band < 3; band += 1) {
      const y = horizon + band * 34;
      ctx.fillStyle = colors[band];
      polygon(ctx, [
        { x: 0, y: y + 24 },
        { x: this.width * 0.28, y },
        { x: this.width * 0.56, y: y + 18 },
        { x: this.width * 0.22, y: y + 48 },
      ]);
      ctx.fill();
      polygon(ctx, [
        { x: this.width, y: y + 8 },
        { x: this.width * 0.76, y: y - 8 },
        { x: this.width * 0.56, y: y + 18 },
        { x: this.width * 0.86, y: y + 52 },
      ]);
      ctx.fill();
    }
  }

  drawFarmShadow() {
    const ctx = this.context;
    const a = this.project(-0.5, 0);
    const b = this.project(MAP_WIDTH - 0.2, -0.2);
    const c = this.project(MAP_WIDTH - 0.2, MAP_HEIGHT + 0.35);
    const d = this.project(-0.5, MAP_HEIGHT + 0.35);
    ctx.fillStyle = "rgba(23, 37, 29, 0.22)";
    polygon(ctx, [
      { x: a.x + 13, y: a.y + 24 },
      { x: b.x + 13, y: b.y + 24 },
      { x: c.x + 13, y: c.y + 24 },
      { x: d.x + 13, y: d.y + 24 },
    ]);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 244, 214, 0.24)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawGroundTile(x, y, state, timeMs) {
    const type = tileType(x, y);
    const colors = tileColors(type, x, y);
    const foundation = (x + y) % 3 === 0
      ? { top: "#6f6b50", left: "#4b4c3d", right: "#383c33" }
      : { top: "#7e7655", left: "#57533e", right: "#414334" };
    this.frameStats?.terrainElevations.add(-0.24);
    this.drawIsoCube(x, y, -0.24, 0.34, foundation, 0.99);
    this.frameStats?.terrainElevations.add(0);
    this.drawIsoCube(x, y, 0, 0.22, colors, 0.98);

    if (type === "channel") {
      const upstream = x <= 4;
      const flowing = upstream || !state.blocked;
      this.drawChannelSurface(x, y, flowing, state, timeMs);
      this.drawChannelBanks(x, y);
    }

    if (type === "soil") this.drawSoilFurrows(x, y, state);
    if ((x + y * 3) % 5 === 0 && type === "grass") this.drawGrassTuft(x, y);
    this.drawTileDetails(x, y, type);
  }

  drawIsoCube(gridX, gridY, elevation, height, colors, scale = 1) {
    const ctx = this.context;
    const center = this.project(gridX, gridY, elevation);
    const halfW = (this.tileWidth * scale) / 2;
    const halfH = (this.tileHeight * scale) / 2;
    const sideH = this.unitZ * height;
    const top = { x: center.x, y: center.y - halfH };
    const right = { x: center.x + halfW, y: center.y };
    const bottom = { x: center.x, y: center.y + halfH };
    const left = { x: center.x - halfW, y: center.y };

    if (this.frameStats) this.frameStats.voxelCount += 1;

    ctx.lineWidth = Math.max(0.8, this.tileWidth / 70);
    ctx.strokeStyle = "rgba(29, 43, 34, 0.52)";

    ctx.fillStyle = colors.left;
    polygon(ctx, [left, bottom, { x: bottom.x, y: bottom.y + sideH }, { x: left.x, y: left.y + sideH }]);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colors.right;
    polygon(ctx, [bottom, right, { x: right.x, y: right.y + sideH }, { x: bottom.x, y: bottom.y + sideH }]);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colors.top;
    polygon(ctx, [top, right, bottom, left]);
    ctx.fill();
    ctx.stroke();

    return { top, right, bottom, left, sideH, center };
  }

  drawChannelSurface(x, y, flowing, state, timeMs) {
    const ctx = this.context;
    const elevation = 0.19;
    const halfLength = 0.5;
    const halfWidth = 0.22;
    const surface = [
      this.project(x - halfLength, y - halfWidth, elevation),
      this.project(x + halfLength, y - halfWidth, elevation),
      this.project(x + halfLength, y + halfWidth, elevation),
      this.project(x - halfLength, y + halfWidth, elevation),
    ];
    const segment = makeProjectedSegment(
      "x",
      { x: x - 0.5, y },
      { x: x + 0.5, y },
      midpoint(surface[0], surface[3]),
      midpoint(surface[1], surface[2]),
      {
        renderedEdges: [
          { start: surface[0], end: surface[1] },
          { start: surface[3], end: surface[2] },
        ],
        joinStart: [surface[0], surface[3]],
        joinEnd: [surface[1], surface[2]],
      },
    );
    this.frameStats?.alignment?.channelSegments.push(segment);

    ctx.fillStyle = flowing ? PALETTE.water : PALETTE.channelDry;
    ctx.strokeStyle = "rgba(29, 43, 34, 0.55)";
    ctx.lineWidth = 1;
    polygon(ctx, surface);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(surface[0].x, surface[0].y);
    ctx.lineTo(surface[1].x, surface[1].y);
    ctx.moveTo(surface[3].x, surface[3].y);
    ctx.lineTo(surface[2].x, surface[2].y);
    ctx.stroke();

    if (!flowing) {
      ctx.strokeStyle = "rgba(43, 58, 51, 0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const dryCrack = [
        this.project(x - 0.27, y - 0.02, elevation + 0.01),
        this.project(x - 0.09, y + 0.05, elevation + 0.01),
        this.project(x + 0.04, y - 0.04, elevation + 0.01),
        this.project(x + 0.26, y + 0.03, elevation + 0.01),
      ];
      ctx.moveTo(dryCrack[0].x, dryCrack[0].y);
      for (const point of dryCrack.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
      return;
    }
    const flow = this.reducedMotion ? 0.5 : ((timeMs / 850 + x * 0.21) % 1);
    const flowX = x - 0.34 + flow * 0.48;
    const start = this.project(flowX, y - 0.04, elevation + 0.015);
    const end = this.project(flowX + 0.18, y - 0.04, elevation + 0.015);
    ctx.strokeStyle = PALETTE.waterLight;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    const depthStart = this.project(x - 0.3, y + 0.07, elevation + 0.008);
    const depthEnd = this.project(x + 0.3, y + 0.07, elevation + 0.008);
    ctx.strokeStyle = "rgba(25, 93, 116, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(depthStart.x, depthStart.y);
    ctx.lineTo(depthEnd.x, depthEnd.y);
    ctx.stroke();
  }

  drawChannelBanks(x, y) {
    for (const side of [-1, 1]) {
      for (const offset of [-0.25, 0.25]) {
        const alternate = (x + (side > 0 ? 1 : 0) + (offset > 0 ? 1 : 0)) % 2 === 0;
        const stone = alternate
          ? { top: "#a0aa89", left: PALETTE.stoneLeft, right: PALETTE.stoneRight }
          : { top: PALETTE.stoneTop, left: "#4d5a48", right: "#39463a" };
        this.drawSmallCube(x + offset, y + side * 0.31, 0.27, 0.14, 0.11, stone);
      }
    }
  }

  drawSoilFurrows(x, y, state) {
    const ctx = this.context;
    const center = this.project(x, y, 0.2);
    ctx.strokeStyle = state.cropsWatered > 0 ? "rgba(58, 54, 35, 0.48)" : "rgba(75, 45, 28, 0.42)";
    ctx.lineWidth = 1;
    for (let offset = -1; offset <= 1; offset += 1) {
      ctx.beginPath();
      ctx.moveTo(center.x - this.tileWidth * 0.28 + offset * 5, center.y - this.tileHeight * 0.12 + offset * 2.5);
      ctx.lineTo(center.x + this.tileWidth * 0.28 + offset * 5, center.y + this.tileHeight * 0.12 + offset * 2.5);
      ctx.stroke();
    }
  }

  drawGrassTuft(x, y) {
    const ctx = this.context;
    const p = this.project(x + 0.18, y - 0.12, 0.22);
    ctx.fillStyle = "rgba(41, 94, 43, 0.82)";
    ctx.fillRect(Math.round(p.x) - 5, Math.round(p.y) - 4, 2, 5);
    ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 7, 2, 8);
    ctx.fillRect(Math.round(p.x) + 3, Math.round(p.y) - 5, 2, 6);
    ctx.fillStyle = "rgba(160, 198, 87, 0.85)";
    ctx.fillRect(Math.round(p.x), Math.round(p.y) - 7, 1, 4);
  }

  drawTileDetails(x, y, type) {
    if (type === "grass" && (x * 7 + y * 11) % 4 === 1) {
      const color = (x + y) % 2 === 0 ? "#a4ca67" : "#5b8e3e";
      this.drawSmallCube(x - 0.24, y + 0.18, 0.24, 0.055, 0.035, {
        top: lighten(color, 12),
        left: color,
        right: darken(color, 18),
      });
    }
    if (type === "path") {
      const stone = (x + y) % 2 === 0 ? "#e1c38a" : "#b98e5c";
      this.drawSmallCube(x - 0.2, y + 0.13, 0.24, 0.06, 0.028, {
        top: stone,
        left: darken(stone, 28),
        right: darken(stone, 42),
      });
      if ((x + y) % 2 === 0) {
        this.drawSmallCube(x + 0.19, y - 0.15, 0.24, 0.045, 0.024, {
          top: "#c7a16c",
          left: "#8d6847",
          right: "#735039",
        });
      }
    }
  }

  drawRoute(route, timeMs) {
    const ctx = this.context;
    ctx.save();
    ctx.strokeStyle = PALETTE.cyan;
    ctx.lineWidth = 3;
    ctx.lineCap = "square";
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = this.reducedMotion ? 0 : -(timeMs / 45) % 14;
    ctx.beginPath();
    route.forEach((point, index) => {
      const p = this.project(point.x, point.y, 0.36);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();

    for (const point of route) {
      const p = this.project(point.x, point.y, 0.36);
      ctx.fillStyle = PALETTE.cyan;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      ctx.strokeRect(p.x - 2, p.y - 2, 4, 4);
    }
  }

  drawProp(prop, state, timeMs) {
    switch (prop.type) {
      case "shed":
        this.drawShed(prop.x, prop.y);
        break;
      case "reservoir":
        this.drawReservoir(prop.x, prop.y, timeMs);
        break;
      case "tree":
        this.drawTree(prop.x, prop.y, prop.scale ?? 1);
        break;
      case "crop":
        this.drawCropBed(prop.x, prop.y, prop.index, state, timeMs);
        break;
      case "debris":
        if (state.blocked) this.drawDebris(prop.x, prop.y, timeMs, state.blockageRevealed);
        else this.drawClearedDebris(prop.x, prop.y);
        break;
      case "fence":
        this.drawFence(prop.x, prop.y, prop.axis);
        break;
      case "sign":
        this.drawSign(prop.x, prop.y, prop.label, prop.accent);
        break;
      case "seedling":
        this.drawSeedlingBed(prop.x, prop.y, prop.index, state);
        break;
      case "cover-stack":
        this.drawCoverStack(prop.x, prop.y, state.seedlingsCovered);
        break;
      case "weather-vane":
        this.drawWeatherVane(prop.x, prop.y, state.stormStage);
        break;
      case "feeder":
        this.drawFeeder(prop.x, prop.y, state);
        break;
      case "grain-tray":
        this.drawGrainTray(prop.x, prop.y, state.grainVisible || state.hensFed);
        break;
      case "hen":
        this.drawHen(prop.x, prop.y, prop.index, state.hensFed);
        break;
      case "crate":
        this.drawCrate(prop.x, prop.y, prop.scale ?? 1);
        break;
      case "hay":
        this.drawHayBale(prop.x, prop.y, prop.scale ?? 1);
        break;
      case "rock":
        this.drawRock(prop.x, prop.y, prop.scale ?? 1);
        break;
      case "flowers":
        this.drawFlowerPatch(prop.x, prop.y, prop.color ?? "#f5bd3f");
        break;
      case "pump":
        this.drawPump(prop.x, prop.y);
        break;
      case "bridge":
        this.drawBridge(prop.x, prop.y);
        break;
      case "bert":
        this.drawBert(prop.bert, timeMs, state);
        break;
      default:
        break;
    }
  }

  drawShed(x, y) {
    this.drawSmallCube(x, y, 0.24, 0.82, 0.12, {
      top: "#9b9470",
      left: "#69674f",
      right: "#4d5141",
    });
    this.drawSmallCube(x, y, 1.06, 0.82, 0.9, {
      top: "#edb75f",
      left: "#a95431",
      right: "#7e392b",
    });
    this.drawSmallCube(x, y, 1.28, 1.02, 0.23, {
      top: PALETTE.roofTop,
      left: PALETTE.roofLeft,
      right: PALETTE.roofRight,
    });
    this.drawSmallCube(x - 0.24, y - 0.23, 1.48, 0.28, 0.21, {
      top: "#684c36",
      left: "#45362b",
      right: "#342a24",
    });
    const door = this.project(x + 0.2, y + 0.22, 0.7);
    const ctx = this.context;
    ctx.fillStyle = "#17352c";
    ctx.fillRect(door.x - 7, door.y - 15, 14, 25);
    ctx.fillStyle = "#2c5d4a";
    ctx.fillRect(door.x - 4, door.y - 11, 8, 6);
    ctx.fillStyle = PALETTE.sun;
    ctx.fillRect(door.x + 3, door.y + 1, 2, 2);

    const window = this.project(x - 0.27, y + 0.2, 0.86);
    ctx.fillStyle = "#8be7ea";
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
    ctx.fillRect(window.x - 4, window.y - 5, 8, 8);
    ctx.strokeRect(window.x - 4, window.y - 5, 8, 8);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillRect(window.x - 2, window.y - 3, 2, 2);
  }

  drawReservoir(x, y, timeMs) {
    const ctx = this.context;
    const base = this.project(x, y, 0.2);
    ctx.strokeStyle = "#263a31";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(base.x - 17, base.y - 2);
    ctx.lineTo(base.x - 21, base.y + 39);
    ctx.moveTo(base.x + 17, base.y - 2);
    ctx.lineTo(base.x + 21, base.y + 39);
    ctx.moveTo(base.x - 17, base.y + 9);
    ctx.lineTo(base.x + 19, base.y + 27);
    ctx.moveTo(base.x + 17, base.y + 9);
    ctx.lineTo(base.x - 19, base.y + 27);
    ctx.stroke();
    this.drawSmallCube(x, y, 1.35, 0.78, 0.6, {
      top: "#a9ece5",
      left: PALETTE.water,
      right: PALETTE.waterDeep,
    });
    this.drawSmallCube(x, y, 1.49, 0.84, 0.12, {
      top: "#c7f4e6",
      left: "#4aa6b8",
      right: "#2c7188",
    });
    const shimmer = this.reducedMotion ? 0 : Math.sin(timeMs / 500) * 2;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(base.x - 10 + shimmer, base.y - 43, 4, 18);
  }

  drawTree(x, y, scale) {
    this.drawSmallCube(x, y, 0.2, 0.16 * scale, 0.7 * scale, {
      top: "#996038",
      left: "#68442f",
      right: "#513326",
    });
    this.drawSmallCube(x, y, 0.86 * scale, 0.78 * scale, 0.5 * scale, {
      top: "#8fc05d",
      left: "#4f883f",
      right: "#3a6e37",
    });
    this.drawSmallCube(x - 0.24, y + 0.1, 1.18 * scale, 0.52 * scale, 0.36 * scale, {
      top: "#a3ca66",
      left: "#5b9345",
      right: "#46793c",
    });
    this.drawSmallCube(x + 0.25, y - 0.07, 1.12 * scale, 0.5 * scale, 0.34 * scale, {
      top: "#94c45d",
      left: "#4e863f",
      right: "#376c35",
    });
    this.drawSmallCube(x - 0.03, y - 0.16, 1.43 * scale, 0.46 * scale, 0.3 * scale, {
      top: "#b0d36c",
      left: "#6b9d48",
      right: "#4d7e3c",
    });
  }

  drawCropBed(x, y, index, state, timeMs) {
    const watered = index < state.cropsWatered;
    const growth = watered ? 0.43 : 0.27;
    const sway = this.reducedMotion ? 0 : Math.sin(timeMs / 520 + index) * 0.025;
    const edging = { top: "#bc8a52", left: "#795036", right: "#5f3a2b" };
    this.drawSmallCube(x - 0.35, y - 0.33, 0.28, 0.12, 0.1, edging);
    this.drawSmallCube(x + 0.35, y + 0.33, 0.28, 0.12, 0.1, edging);
    const offsets = [
      [-0.2, -0.1],
      [0.05, 0.07],
      [0.24, -0.06],
    ];
    for (let plant = 0; plant < offsets.length; plant += 1) {
      const [dx, dy] = offsets[plant];
      const color = watered ? PALETTE.cropWet : PALETTE.cropDry;
      this.drawSmallCube(x + dx + sway, y + dy, 0.23, 0.11, growth, {
        top: lighten(color, 18),
        left: color,
        right: darken(color, 18),
      });
      this.drawSmallCube(x + dx - 0.08 + sway, y + dy + 0.03, 0.43 + (watered ? 0.1 : 0), 0.1, 0.09, {
        top: watered ? "#75b852" : "#c49a51",
        left: watered ? "#3f843f" : "#8c6739",
        right: watered ? "#2f6635" : "#6a4a31",
      });
      this.drawSmallCube(x + dx + 0.08 + sway, y + dy - 0.03, 0.47 + (watered ? 0.12 : 0), 0.095, 0.08, {
        top: watered ? "#8bc65a" : "#d1a65a",
        left: watered ? "#4d9544" : "#936c3b",
        right: watered ? "#376f38" : "#704d31",
      });
      if (watered) {
        this.drawSmallCube(x + dx + 0.08 + sway, y + dy + 0.05, 0.31 + growth, 0.09, 0.1, {
          top: "#ff9d64",
          left: PALETTE.tomato,
          right: "#bc3e32",
        });
        if (plant !== 1) {
          this.drawSmallCube(x + dx - 0.07 + sway, y + dy - 0.03, 0.26 + growth, 0.07, 0.075, {
            top: "#ff8b5b",
            left: "#db4934",
            right: "#a9342e",
          });
        }
      }
    }

    if (watered && !this.reducedMotion) {
      const p = this.project(x + 0.2, y - 0.1, 0.82);
      const alpha = 0.25 + (Math.sin(timeMs / 300 + index) + 1) * 0.2;
      this.context.fillStyle = `rgba(255, 248, 223, ${alpha})`;
      this.context.fillRect(p.x - 1, p.y - 5, 2, 10);
      this.context.fillRect(p.x - 5, p.y - 1, 10, 2);
    }
  }

  drawSeedlingBed(x, y, index, state) {
    const covered = state.seedlingsCovered;
    const battered = state.seedlingsBattered;
    const edging = { top: "#c18c54", left: "#7d5135", right: "#603b2b" };
    this.drawSmallCube(x - 0.35, y - 0.33, 0.28, 0.12, 0.1, edging);
    this.drawSmallCube(x + 0.35, y + 0.33, 0.28, 0.12, 0.1, edging);
    this.drawSmallCube(x, y, 0.245, 0.66, 0.055, {
      top: battered ? "#74513d" : "#835235",
      left: "#593526",
      right: "#42291f",
    });

    const offsets = [
      [-0.22, -0.09],
      [0, 0.04],
      [0.22, -0.06],
      [-0.08, 0.16],
    ];
    for (let seedling = 0; seedling < offsets.length; seedling += 1) {
      const [dx, dy] = offsets[seedling];
      const lean = battered ? (seedling % 2 === 0 ? 0.1 : -0.09) : 0;
      const stem = battered ? "#806b3c" : PALETTE.seedling;
      const leaf = battered ? "#9a7342" : PALETTE.seedlingLight;
      this.drawSmallCube(x + dx + lean, y + dy, 0.28, 0.075, battered ? 0.16 : 0.27, {
        top: lighten(stem, 14),
        left: stem,
        right: darken(stem, 18),
      }, lean * 0.9);
      this.drawSmallCube(x + dx - 0.07 + lean, y + dy + 0.025, battered ? 0.4 : 0.49, 0.09, 0.07, {
        top: lighten(leaf, 15),
        left: leaf,
        right: darken(leaf, 20),
      }, lean);
      this.drawSmallCube(x + dx + 0.07 + lean, y + dy - 0.025, battered ? 0.37 : 0.52, 0.085, 0.065, {
        top: lighten(leaf, 12),
        left: leaf,
        right: darken(leaf, 22),
      }, -lean);
    }

    if (covered) this.drawSeedlingCover(x, y, index);
    if (battered) {
      const ctx = this.context;
      const marker = this.project(x, y, 0.76);
      ctx.fillStyle = "#e65e42";
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1;
      ctx.fillRect(marker.x - 7, marker.y - 10, 14, 10);
      ctx.strokeRect(marker.x - 7, marker.y - 10, 14, 10);
      ctx.fillStyle = PALETTE.paper;
      ctx.font = `900 ${clamp(this.tileWidth / 7.6, 8, 11)}px ${this.monoFont}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", marker.x, marker.y - 5);
    }
  }

  drawSeedlingCover(x, y, index) {
    const coverTop = index % 2 === 0 ? "#d5f2e7" : "#c6e9e1";
    const coverColors = { top: coverTop, left: "#79b7ae", right: "#548d89" };
    const postColors = { top: "#f1f2d8", left: "#a2b7a8", right: "#748d83" };
    for (const [dx, dy] of [[-0.31, -0.24], [0.31, 0.24], [-0.22, 0.22], [0.22, -0.22]]) {
      this.drawSmallCube(x + dx, y + dy, 0.49, 0.055, 0.32, postColors);
    }
    this.drawSmallCube(x, y, 0.82, 0.76, 0.09, coverColors);
    const ctx = this.context;
    const label = this.project(x, y, 0.85);
    ctx.fillStyle = "rgba(255, 255, 235, 0.86)";
    ctx.fillRect(label.x - 8, label.y - 3, 16, 5);
  }

  drawCoverStack(x, y, coversInUse) {
    const base = { top: "#9b9470", left: "#68664f", right: "#4d5141" };
    this.drawSmallCube(x, y, 0.28, 0.5, 0.09, base);
    const layers = coversInUse ? 1 : 3;
    for (let layer = 0; layer < layers; layer += 1) {
      this.drawSmallCube(x - layer * 0.025, y + layer * 0.018, 0.38 + layer * 0.12, 0.42 - layer * 0.025, 0.09, {
        top: layer % 2 === 0 ? "#d5f2e7" : "#b9ded8",
        left: "#78aaa2",
        right: "#527f7b",
      });
    }
    const tag = this.project(x, y, 0.64 + (layers - 1) * 0.12);
    const ctx = this.context;
    ctx.fillStyle = PALETTE.paper;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
    ctx.fillRect(tag.x - 13, tag.y - 8, 26, 10);
    ctx.strokeRect(tag.x - 13, tag.y - 8, 26, 10);
    ctx.fillStyle = "#316e68";
    ctx.font = `800 ${clamp(this.tileWidth / 11, 6, 8)}px ${this.monoFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(coversInUse ? "SPARE" : "COVERS", tag.x, tag.y - 3);
  }

  drawWeatherVane(x, y, stormStage) {
    this.drawSign(x, y, WEATHER_SIGN.label, "#e9a13b");
    this.drawSmallCube(x, y, 0.82, 0.07, 0.88, {
      top: "#e5eee4",
      left: "#7e958a",
      right: "#586f68",
    });
    const ctx = this.context;
    const pivot = this.project(x, y, 1.72);
    const angleByStage = { calm: -0.18, building: 0.54, raining: 0.88, cleared: -0.42 };
    const angle = angleByStage[stormStage] ?? angleByStage.building;
    const dx = Math.cos(angle) * 24;
    const dy = Math.sin(angle) * 13;
    ctx.save();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(pivot.x - dx, pivot.y - dy);
    ctx.lineTo(pivot.x + dx, pivot.y + dy);
    ctx.stroke();
    ctx.strokeStyle = "#f3c84e";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#e85e3e";
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pivot.x + dx + Math.cos(angle) * 7, pivot.y + dy + Math.sin(angle) * 4);
    ctx.lineTo(pivot.x + dx - 7, pivot.y + dy - 7);
    ctx.lineTo(pivot.x + dx - 9, pivot.y + dy + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.paper;
    ctx.strokeStyle = PALETTE.ink;
    ctx.font = `900 ${clamp(this.tileWidth / 10, 7, 9)}px ${this.monoFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", pivot.x, pivot.y - 14);
    ctx.restore();
  }

  drawFeeder(x, y, state) {
    const metal = { top: "#dbe4d7", left: "#7f968b", right: "#5b716a" };
    const darkMetal = { top: "#a9bbb0", left: "#62766e", right: "#405650" };
    this.drawSmallCube(x - 0.22, y + 0.18, 0.48, 0.08, 0.5, darkMetal);
    this.drawSmallCube(x + 0.22, y - 0.18, 0.48, 0.08, 0.5, darkMetal);
    this.drawSmallCube(x, y, 1.02, 0.7, 0.62, metal);
    this.drawSmallCube(x, y, 1.34, 0.76, 0.12, {
      top: "#edf3df",
      left: "#98aaa0",
      right: "#697d75",
    });
    if (state.feederFull) {
      this.drawSmallCube(x - 0.03, y - 0.03, 1.48, 0.56, 0.08, {
        top: "#ffe375",
        left: PALETTE.grain,
        right: "#b8872f",
      });
    }
    this.drawSmallCube(x + 0.34, y + 0.31, 0.68, 0.23, 0.43, darkMetal, -0.08);
    if (state.chuteJammed) {
      this.drawSmallCube(x + 0.43, y + 0.39, 0.55, 0.2, 0.2, {
        top: "#eb8a48",
        left: "#a54d35",
        right: "#77352d",
      }, 0.1);
      const warning = this.project(x + 0.43, y + 0.39, 0.94);
      const ctx = this.context;
      ctx.fillStyle = "#e85e3e";
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1;
      ctx.fillRect(warning.x - 7, warning.y - 8, 14, 10);
      ctx.strokeRect(warning.x - 7, warning.y - 8, 14, 10);
      ctx.fillStyle = PALETTE.paper;
      ctx.font = `900 ${clamp(this.tileWidth / 8, 8, 10)}px ${this.monoFont}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", warning.x, warning.y - 3);
    }
  }

  drawGrainTray(x, y, grainVisible) {
    this.drawSmallCube(x, y, 0.3, 0.58, 0.1, {
      top: "#9caaa0",
      left: "#596d65",
      right: "#3f514c",
    });
    this.drawSmallCube(x, y, 0.37, 0.46, 0.045, {
      top: grainVisible ? "#f5d35f" : "#3f514c",
      left: grainVisible ? "#ba8731" : "#2e403b",
      right: grainVisible ? "#8f642b" : "#24352f",
    });
    if (!grainVisible) return;
    for (const [dx, dy] of [[-0.14, -0.08], [0.04, 0.03], [0.16, -0.02], [-0.02, 0.13]]) {
      this.drawSmallCube(x + dx, y + dy, 0.43, 0.035, 0.025, {
        top: "#ffe783",
        left: PALETTE.grain,
        right: "#a8732c",
      });
    }
  }

  drawHen(x, y, index, fed) {
    const bodyColor = index % 2 === 0 ? PALETTE.henWhite : PALETTE.henBrown;
    const body = {
      top: lighten(bodyColor, 18),
      left: bodyColor,
      right: darken(bodyColor, 25),
    };
    const wing = index % 2 === 0 ? "#cdbf9f" : "#8f432f";
    const bodyScale = fed ? 0.45 : 0.39;
    const headLift = fed ? 0.08 : -0.02;
    this.drawSmallCube(x, y, 0.56, bodyScale, fed ? 0.4 : 0.34, body);
    this.drawSmallCube(x - 0.12, y + 0.06, 0.62, 0.23, 0.18, {
      top: lighten(wing, 16),
      left: wing,
      right: darken(wing, 22),
    }, -0.04);
    this.drawSmallCube(x + 0.22, y - 0.12, 0.84 + headLift, 0.25, 0.25, body);
    this.drawSmallCube(x + 0.39, y - 0.2, 0.81 + headLift, 0.12, 0.1, {
      top: "#ffd36a",
      left: "#e28c32",
      right: "#a95628",
    }, 0.08);
    this.drawSmallCube(x + 0.18, y - 0.13, 1.07 + headLift, 0.11, 0.09, {
      top: "#ff8a57",
      left: "#d64b39",
      right: "#a33231",
    });
    this.drawSmallCube(x - 0.32, y + 0.17, 0.75, 0.18, 0.23, {
      top: lighten(bodyColor, 10),
      left: darken(bodyColor, 10),
      right: darken(bodyColor, 32),
    }, -0.13);
    for (const offset of [-0.1, 0.1]) {
      this.drawSmallCube(x + offset, y + 0.03, 0.32, 0.045, 0.22, {
        top: "#ffd36a",
        left: "#d68a32",
        right: "#a45928",
      });
    }

    const ctx = this.context;
    const eye = this.project(x + 0.31, y - 0.06, 0.94 + headLift);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(Math.round(eye.x) - 1, Math.round(eye.y) - 1, 3, 3);
    const status = this.project(x, y, 1.32);
    ctx.fillStyle = fed ? "#59bd5b" : "#e85e3e";
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
    ctx.fillRect(status.x - 6, status.y - 7, 12, 10);
    ctx.strokeRect(status.x - 6, status.y - 7, 12, 10);
    ctx.fillStyle = PALETTE.paper;
    ctx.font = `900 ${clamp(this.tileWidth / 9, 7, 9)}px ${this.monoFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fed ? "✓" : "!", status.x, status.y - 2);
  }

  drawDebris(x, y, timeMs, highlighted = true) {
    const wobble = this.reducedMotion ? 0 : Math.sin(timeMs / 420) * 0.01;
    this.drawSmallCube(x - 0.12, y + 0.05, 0.28, 0.46, 0.36, {
      top: "#d08a43",
      left: "#96532f",
      right: "#743b29",
    }, wobble);
    this.drawSmallCube(x + 0.18, y - 0.03, 0.28, 0.32, 0.48, {
      top: "#d9a04d",
      left: "#a66232",
      right: "#81442b",
    }, -wobble);

    if (!highlighted) return;

    const p = this.project(x, y, 0.98);
    const ctx = this.context;
    ctx.fillStyle = PALETTE.warning ?? "#ee6a3a";
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 8);
    ctx.lineTo(p.x + 7, p.y + 5);
    ctx.lineTo(p.x - 7, p.y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  drawClearedDebris(x, y) {
    this.drawSmallCube(x + 0.37, y + 0.32, 0.22, 0.2, 0.13, {
      top: "#b77b45",
      left: "#805037",
      right: "#68402e",
    });
  }

  drawCrate(x, y, scale = 1) {
    this.drawSmallCube(x, y, 0.58 * scale, 0.34 * scale, 0.36 * scale, {
      top: "#dfa15a",
      left: "#9a5b32",
      right: "#72402a",
    });
    const p = this.project(x, y, 0.46 * scale);
    const ctx = this.context;
    ctx.strokeStyle = "#4d3024";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - 7 * scale, p.y - 7 * scale);
    ctx.lineTo(p.x + 7 * scale, p.y + 4 * scale);
    ctx.moveTo(p.x + 7 * scale, p.y - 7 * scale);
    ctx.lineTo(p.x - 7 * scale, p.y + 4 * scale);
    ctx.stroke();
  }

  drawHayBale(x, y, scale = 1) {
    this.drawSmallCube(x, y, 0.52 * scale, 0.42 * scale, 0.3 * scale, {
      top: "#f2c24e",
      left: "#bc7e30",
      right: "#8d5928",
    });
    const p = this.project(x, y, 0.48 * scale);
    const ctx = this.context;
    ctx.strokeStyle = "#79502a";
    ctx.lineWidth = 1.5;
    for (let line = -1; line <= 1; line += 1) {
      ctx.beginPath();
      ctx.moveTo(p.x - 9 * scale, p.y + line * 4 * scale);
      ctx.lineTo(p.x + 9 * scale, p.y + line * 4 * scale);
      ctx.stroke();
    }
  }

  drawRock(x, y, scale = 1) {
    this.drawSmallCube(x, y, 0.38 * scale, 0.27 * scale, 0.2 * scale, {
      top: "#9ca083",
      left: "#666e5d",
      right: "#4b554a",
    }, 0.08);
    this.drawSmallCube(x - 0.12, y + 0.09, 0.28 * scale, 0.14 * scale, 0.11 * scale, {
      top: "#b1ad8c",
      left: "#74715e",
      right: "#555648",
    }, -0.05);
  }

  drawFlowerPatch(x, y, color) {
    const ctx = this.context;
    const offsets = [[-0.1, 0.04], [0.08, -0.05], [0.18, 0.1]];
    for (const [dx, dy] of offsets) {
      const p = this.project(x + dx, y + dy, 0.34);
      ctx.fillStyle = "#3e7a3c";
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 5, 2, 6);
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 8, 6, 4);
      ctx.fillStyle = PALETTE.paper;
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 7, 2, 2);
    }
  }

  drawPump(x, y) {
    this.drawSmallCube(x, y, 0.65, 0.22, 0.46, {
      top: "#76cad6",
      left: "#327f91",
      right: "#245a6d",
    });
    this.drawSmallCube(x, y, 0.82, 0.3, 0.13, {
      top: "#a3e7e5",
      left: "#4799a9",
      right: "#2c6e80",
    });
    const p = this.project(x + 0.05, y + 0.03, 0.58);
    const ctx = this.context;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 15, p.y - 9);
    ctx.lineTo(p.x + 20, p.y - 6);
    ctx.stroke();
    ctx.strokeStyle = "#d8e0d4";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawBridge(x, y) {
    const plank = { top: "#d79a52", left: "#8d532f", right: "#673a29" };
    for (let offset = -2; offset <= 2; offset += 1) {
      this.drawSmallCube(x + offset * 0.1, y - offset * 0.1, 0.41, 0.19, 0.12, plank);
    }
    this.drawSmallCube(x - 0.34, y - 0.34, 0.48, 0.09, 0.22, {
      top: "#f0c173",
      left: "#9b5f36",
      right: "#75452e",
    });
    this.drawSmallCube(x + 0.34, y + 0.34, 0.48, 0.09, 0.22, {
      top: "#f0c173",
      left: "#9b5f36",
      right: "#75452e",
    });
  }

  drawFence(x, y, axis) {
    const ctx = this.context;
    const halfSpan = 0.5;
    const startGrid = axis === "x" ? { x: x - halfSpan, y } : { x, y: y - halfSpan };
    const endGrid = axis === "x" ? { x: x + halfSpan, y } : { x, y: y + halfSpan };
    const railElevations = [0.64, 0.43];
    const rails = railElevations.map((elevation) => ({
      start: this.project(startGrid.x, startGrid.y, elevation),
      end: this.project(endGrid.x, endGrid.y, elevation),
    }));
    const postStart = this.project(startGrid.x, startGrid.y, railElevations[0]);
    const postEnd = this.project(endGrid.x, endGrid.y, railElevations[0]);
    const segment = makeProjectedSegment(axis, startGrid, endGrid, rails[0].start, rails[0].end, {
      renderedEdges: rails,
      joinStart: rails.map((rail) => rail.start),
      joinEnd: rails.map((rail) => rail.end),
      postStart,
      postEnd,
    });
    this.frameStats?.alignment?.fenceSegments.push(segment);

    ctx.save();
    ctx.lineCap = "butt";
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 7;
    ctx.beginPath();
    for (const rail of rails) {
      ctx.moveTo(rail.start.x, rail.start.y);
      ctx.lineTo(rail.end.x, rail.end.y);
    }
    ctx.stroke();
    ctx.strokeStyle = "#efcd8d";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    this.drawSmallCube(startGrid.x, startGrid.y, 0.72, 0.1, 0.52, {
      top: "#ffe0a2",
      left: "#b47a44",
      right: "#865335",
    });
    this.drawSmallCube(endGrid.x, endGrid.y, 0.72, 0.1, 0.52, {
      top: "#ffe0a2",
      left: "#b47a44",
      right: "#865335",
    });
  }

  drawSign(x, y, label, accent = PALETTE.water) {
    const ctx = this.context;
    const p = this.project(x, y, 0.28);
    const boardWidth = clamp(this.tileWidth * 1.08, 58, 74);
    const boardHeight = clamp(this.tileHeight * 0.52, 17, 21);
    const boardLeft = p.x - boardWidth / 2;
    const boardTop = p.y - boardHeight - 19;

    ctx.save();
    ctx.fillStyle = "rgba(29, 43, 34, 0.24)";
    ctx.fillRect(boardLeft + 3, boardTop + 3, boardWidth, boardHeight);

    ctx.fillStyle = PALETTE.woodLeft;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1.5;
    ctx.fillRect(p.x - 2.5, boardTop + boardHeight - 1, 5, p.y - boardTop - boardHeight + 2);
    ctx.strokeRect(p.x - 2.5, boardTop + boardHeight - 1, 5, p.y - boardTop - boardHeight + 2);

    ctx.fillStyle = PALETTE.paper;
    ctx.fillRect(boardLeft, boardTop, boardWidth, boardHeight);
    ctx.strokeRect(boardLeft, boardTop, boardWidth, boardHeight);

    ctx.fillStyle = accent;
    ctx.fillRect(boardLeft + 3, boardTop + 3, 4, boardHeight - 6);

    ctx.fillStyle = PALETTE.ink;
    ctx.font = `800 ${clamp(this.tileWidth / 8.6, 7, 9)}px ${this.monoFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, p.x + 3, boardTop + boardHeight / 2 + 0.5);

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 5);
    ctx.lineTo(p.x + 4, p.y - 10);
    ctx.lineTo(p.x - 4, p.y - 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawBert(bert, timeMs, worldState) {
    const movingBob = bert.moving && !this.reducedMotion ? Math.abs(Math.sin(timeMs / 110)) * 0.075 : 0;
    const idleBob = !bert.moving && !this.reducedMotion ? Math.sin(timeMs / 760) * 0.018 : 0;
    const gait = bert.moving && !this.reducedMotion ? Math.sin(timeMs / 105) * 0.075 : 0;
    const isThinking = bert.action === "think";
    const isWorking = ["inspect", "clear", "water", "cover", "unjam", "feed"].includes(bert.action);
    const isVerified = worldState.verified && !bert.moving;
    const z = 0.29 + movingBob + idleBob;
    const x = bert.x;
    const y = bert.y;
    const renderedParts = new Set();
    const renderedBounds = [];
    const voxel = (part, gridX, gridY, elevation, scale, height, colors, skew = 0) => {
      renderedBounds.push(this.drawSmallCube(gridX, gridY, elevation, scale, height, colors, skew));
      renderedParts.add(part);
    };

    const shadow = this.project(x, y, 0.22);
    const ctx = this.context;
    ctx.fillStyle = "rgba(23, 37, 29, 0.3)";
    polygon(ctx, [
      { x: shadow.x - this.tileWidth * 0.24, y: shadow.y + 1 },
      { x: shadow.x, y: shadow.y - this.tileHeight * 0.1 },
      { x: shadow.x + this.tileWidth * 0.24, y: shadow.y + 1 },
      { x: shadow.x, y: shadow.y + this.tileHeight * 0.16 },
    ]);
    ctx.fill();

    const bootColors = { top: "#425046", left: "#24352e", right: "#15241e" };
    const denim = { top: PALETTE.denimTop, left: PALETTE.denimLeft, right: PALETTE.denimRight };
    const shirt = { top: "#ef8b46", left: "#b84e32", right: "#85362a" };
    const skin = { top: "#ffe0a2", left: "#d89d62", right: "#b7784e" };
    const straw = { top: "#f7d35e", left: "#bf8731", right: "#8d5e27" };

    voxel("left-boot", x - 0.14 + gait, y + 0.07, z + 0.17, 0.16, 0.18, bootColors);
    voxel("right-boot", x + 0.14 - gait, y - 0.05, z + 0.17, 0.16, 0.18, bootColors);
    voxel("left-leg", x - 0.13 + gait, y + 0.06, z + 0.55, 0.14, 0.39, denim);
    voxel("right-leg", x + 0.13 - gait, y - 0.04, z + 0.55, 0.14, 0.39, denim);

    const farArmLift = isThinking ? 0.16 : isWorking ? 0.1 : isVerified ? 0.13 : 0;
    voxel("left-arm", x - 0.28 - gait * 0.7, y + 0.02, z + 0.98 + farArmLift, 0.12, 0.45, shirt, -gait * 0.4);
    voxel("left-hand", x - 0.29 - gait * 0.7, y + 0.02, z + 0.55 + farArmLift, 0.13, 0.13, skin);

    voxel("pelvis", x, y, z + 0.69, 0.4, 0.18, denim);
    voxel("torso", x, y, z + 1.13, 0.43, 0.5, shirt);
    voxel("overall-bib", x + 0.035, y + 0.055, z + 1.08, 0.29, 0.34, denim);

    const nearArmLift = isThinking ? 0.28 : isWorking ? 0.16 : isVerified ? 0.2 : 0;
    const nearArmReach = isWorking ? 0.07 : 0;
    voxel("right-arm", x + 0.29 + gait * 0.7 + nearArmReach, y - 0.03, z + 0.98 + nearArmLift, 0.12, 0.44, shirt, gait * 0.4);
    voxel("right-hand", x + 0.3 + gait * 0.7 + nearArmReach, y - 0.03, z + 0.56 + nearArmLift, 0.13, 0.13, skin);

    voxel("hair", x - 0.04, y - 0.03, z + 1.51, 0.37, 0.35, {
      top: "#71452f",
      left: "#4a3026",
      right: "#35241f",
    });
    voxel("head", x + 0.015, y + 0.02, z + 1.49, 0.34, 0.34, skin);
    this.drawBertFace(x, y, z);
    renderedParts.add("face");

    voxel("hat-brim", x, y, z + 1.64, 0.56, 0.1, straw);
    voxel("hat-crown", x - 0.015, y - 0.02, z + 1.83, 0.37, 0.2, straw);

    const bib = this.project(x + 0.1, y + 0.1, z + 1.03);
    ctx.fillStyle = "#a7e2e1";
    ctx.fillRect(Math.round(bib.x) - 5, Math.round(bib.y) - 5, 3, 10);
    ctx.fillRect(Math.round(bib.x) + 3, Math.round(bib.y) - 2, 3, 9);
    ctx.fillStyle = PALETTE.sun;
    ctx.fillRect(Math.round(bib.x) - 1, Math.round(bib.y) + 2, 3, 3);

    if (["clear", "inspect", "unjam"].includes(bert.action)) {
      renderedBounds.push(this.drawWrench(x, y, z, timeMs, bert.action));
      renderedParts.add("tool");
    }
    if (bert.action === "cover") {
      renderedBounds.push(this.drawCarriedCover(x, y, z));
      renderedParts.add("cover");
    }
    if (bert.action === "feed") {
      renderedBounds.push(this.drawFeedScoop(x, y, z));
      renderedParts.add("feed-scoop");
    }

    const screenBounds = mergeBounds(renderedBounds);
    if (this.frameStats) {
      this.frameStats.bert = {
        silhouette: WORLD_PRESENTATION.bertSilhouette,
        action: bert.action,
        moving: bert.moving,
        pose: isVerified ? "verify" : bert.moving ? "walk" : bert.action,
        renderedParts: [...renderedParts].sort(),
        screenBounds,
      };
    }
  }

  drawBertFace(x, y, z) {
    const ctx = this.context;
    const face = this.project(x + 0.105, y + 0.105, z + 1.34);
    const px = Math.max(2, Math.round(this.tileWidth / 36));
    ctx.fillStyle = "#1a2a22";
    ctx.fillRect(Math.round(face.x) - px * 3, Math.round(face.y) - px, px, px);
    ctx.fillRect(Math.round(face.x) + px, Math.round(face.y) + 1, px, px);
    ctx.fillStyle = "#a66544";
    ctx.fillRect(Math.round(face.x) - px, Math.round(face.y) + px, px, px);
    ctx.fillStyle = "#713b32";
    ctx.fillRect(Math.round(face.x) - px, Math.round(face.y) + px * 3, px * 2, px);
  }

  drawWrench(x, y, z, timeMs, action) {
    const ctx = this.context;
    const p = this.project(x + 0.34, y - 0.06, z + 0.86);
    const swing = action === "clear" && !this.reducedMotion ? Math.sin(timeMs / 110) * 0.42 : -0.3;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(swing);
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(16, -14);
    ctx.stroke();
    ctx.strokeStyle = "#d7e0d8";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(14, -17);
    ctx.lineTo(19, -20);
    ctx.moveTo(14, -17);
    ctx.lineTo(20, -12);
    ctx.stroke();
    ctx.strokeStyle = "#eef3e7";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    const rotatePoint = (point) => ({
      x: p.x + point.x * Math.cos(swing) - point.y * Math.sin(swing),
      y: p.y + point.x * Math.sin(swing) + point.y * Math.cos(swing),
    });
    const bounds = boundsForPoints([
      rotatePoint({ x: -5, y: 5 }),
      rotatePoint({ x: 25, y: -25 }),
      rotatePoint({ x: 25, y: -7 }),
    ]);
    return expandBounds(bounds, 4);
  }

  drawCarriedCover(x, y, z) {
    return this.drawSmallCube(x + 0.38, y - 0.06, z + 0.78, 0.38, 0.11, {
      top: "#d5f2e7",
      left: "#78aaa2",
      right: "#527f7b",
    }, 0.08);
  }

  drawFeedScoop(x, y, z) {
    const ctx = this.context;
    const handleStart = this.project(x + 0.28, y - 0.04, z + 0.86);
    const scoop = this.project(x + 0.5, y - 0.1, z + 0.72);
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(handleStart.x, handleStart.y);
    ctx.lineTo(scoop.x, scoop.y);
    ctx.stroke();
    ctx.strokeStyle = "#dbe4d7";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = PALETTE.grain;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
    ctx.fillRect(scoop.x - 7, scoop.y - 4, 14, 8);
    ctx.strokeRect(scoop.x - 7, scoop.y - 4, 14, 8);
    return expandBounds(boundsForPoints([handleStart, { x: scoop.x - 7, y: scoop.y - 4 }, { x: scoop.x + 7, y: scoop.y + 4 }]), 3);
  }

  drawSmallCube(gridX, gridY, elevation, scale, height, colors, skew = 0) {
    const ctx = this.context;
    const center = this.project(gridX, gridY, elevation);
    const halfW = (this.tileWidth * scale) / 2;
    const halfH = (this.tileHeight * scale) / 2;
    const sideH = this.unitZ * height;
    const top = { x: center.x + skew * 10, y: center.y - halfH };
    const right = { x: center.x + halfW, y: center.y };
    const bottom = { x: center.x - skew * 10, y: center.y + halfH };
    const left = { x: center.x - halfW, y: center.y };
    if (this.frameStats) this.frameStats.voxelCount += 1;
    ctx.strokeStyle = "rgba(29, 43, 34, 0.78)";
    ctx.lineWidth = Math.max(0.8, this.tileWidth / 75);

    ctx.fillStyle = colors.left;
    polygon(ctx, [left, bottom, { x: bottom.x, y: bottom.y + sideH }, { x: left.x, y: left.y + sideH }]);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.right;
    polygon(ctx, [bottom, right, { x: right.x, y: right.y + sideH }, { x: bottom.x, y: bottom.y + sideH }]);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.top;
    polygon(ctx, [top, right, bottom, left]);
    ctx.fill();
    ctx.stroke();

    return boundsForPoints([
      top,
      right,
      bottom,
      left,
      { x: right.x, y: right.y + sideH },
      { x: bottom.x, y: bottom.y + sideH },
      { x: left.x, y: left.y + sideH },
    ]);
  }

  drawForegroundVignette() {
    const ctx = this.context;
    const gradient = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.46,
      this.width * 0.2,
      this.width * 0.5,
      this.height * 0.48,
      this.width * 0.75,
    );
    gradient.addColorStop(0, "rgba(29, 43, 34, 0)");
    gradient.addColorStop(1, "rgba(29, 43, 34, 0.12)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
  }
}

function normalizeState(state) {
  const sceneId = WORLD_LANDMARKS[state.sceneId] ? state.sceneId : "east-channel";
  const stormStage = ["calm", "building", "raining", "cleared"].includes(state.stormStage)
    ? state.stormStage
    : "building";
  return {
    sceneId,
    blocked: sceneId === "east-channel" ? state.blocked !== false : false,
    blockageRevealed: Boolean(state.blockageRevealed),
    cropsWatered: clamp(Number(state.cropsWatered ?? 0), 0, 3),
    seedlingsCovered: Boolean(state.seedlingsCovered),
    seedlingsBattered: Boolean(state.seedlingsBattered),
    stormStage,
    feederFull: state.feederFull !== false,
    chuteJammed: state.chuteJammed !== false,
    hensFed: Boolean(state.hensFed),
    grainVisible: Boolean(state.grainVisible),
    verified: Boolean(state.verified),
    routeVisible: Boolean(state.routeVisible),
    route: Array.isArray(state.route) ? state.route : [],
    bert: {
      x: Number(state.bert?.x ?? 2.2),
      y: Number(state.bert?.y ?? 5.25),
      moving: Boolean(state.bert?.moving),
      action: state.bert?.action ?? "idle",
    },
  };
}

function createBaseProps() {
  return [
    { type: "shed", x: 1.15, y: 0.95 },
    { type: "tree", x: 0.15, y: 0.25, scale: 0.92 },
    { type: "tree", x: 0.32, y: 5.85, scale: 0.75 },
    { type: "tree", x: 8.25, y: 0.45, scale: 0.72 },
    { type: "reservoir", x: 0.78, y: 3.05 },
    { type: "pump", x: 1.3, y: 3.02 },
    { type: "bridge", x: 2.05, y: 3.02, depthOffset: 0.04 },
    { type: "crate", x: 1.78, y: 1.02, scale: 0.92 },
    { type: "crate", x: 1.56, y: 1.48, scale: 0.68 },
    { type: "hay", x: 0.7, y: 1.42, scale: 0.9 },
    { type: "rock", x: 4.7, y: 0.5, scale: 0.8 },
    { type: "rock", x: 8.18, y: 5.72, scale: 0.64 },
    { type: "flowers", x: 0.85, y: 5.5, color: "#f5bd3f" },
    { type: "flowers", x: 7.82, y: 1.05, color: "#ef6a50" },
    { type: "fence", x: 2.2, y: 6.15, axis: "x" },
    { type: "fence", x: 3.2, y: 6.15, axis: "x" },
    { type: "fence", x: 5.2, y: 6.15, axis: "x" },
    { type: "fence", x: 6.2, y: 6.15, axis: "x" },
    { type: "fence", x: 8.15, y: 2.1, axis: "y" },
    { type: "fence", x: 8.15, y: 3.1, axis: "y" },
  ];
}

function createEastChannelProps() {
  return [
    { type: "debris", x: 4.1, y: 3.02, depthOffset: 0.1 },
    { type: "crop", x: 6.15, y: 4.28, index: 0 },
    { type: "crop", x: 7.12, y: 4.22, index: 1 },
    { type: "crop", x: 7.05, y: 5.18, index: 2 },
    {
      type: "sign",
      x: IRRIGATION_SIGN.position.x,
      y: IRRIGATION_SIGN.position.y,
      label: IRRIGATION_SIGN.label,
    },
  ];
}

function createStormWatchProps() {
  return [
    { type: "cover-stack", x: 2.3, y: 0.85, depthOffset: 0.05 },
    { type: "weather-vane", x: WEATHER_SIGN.position.x, y: WEATHER_SIGN.position.y, depthOffset: 0.08 },
    { type: "seedling", x: 6.15, y: 4.28, index: 0 },
    { type: "seedling", x: 7.12, y: 4.22, index: 1 },
    { type: "seedling", x: 7.05, y: 5.18, index: 2 },
  ];
}

function createHungryHensProps() {
  return [
    {
      type: "sign",
      x: FEEDER_SIGN.position.x,
      y: FEEDER_SIGN.position.y,
      label: FEEDER_SIGN.label,
      accent: "#e9a13b",
    },
    { type: "feeder", x: 5.86, y: 4.18, depthOffset: 0.08 },
    { type: "grain-tray", x: 6.35, y: 4.55, depthOffset: 0.1 },
    { type: "hen", x: 6.82, y: 4.18, index: 0, depthOffset: 0.12 },
    { type: "hen", x: 7.36, y: 4.65, index: 1, depthOffset: 0.12 },
    { type: "hen", x: 6.92, y: 5.24, index: 2, depthOffset: 0.12 },
  ];
}

function freezeProps(props) {
  return Object.freeze(props.map((prop) => Object.freeze(prop)));
}

const BASE_PROPS = freezeProps(createBaseProps());
const SCENE_PROPS = Object.freeze({
  "east-channel": freezeProps(createEastChannelProps()),
  "storm-watch": freezeProps(createStormWatchProps()),
  "hungry-hens": freezeProps(createHungryHensProps()),
});

function propsForScene(sceneId) {
  return [...BASE_PROPS, ...(SCENE_PROPS[sceneId] ?? SCENE_PROPS["east-channel"])];
}

function landmarksForScene(sceneId) {
  return (WORLD_LANDMARKS[sceneId] ?? WORLD_LANDMARKS["east-channel"]).map((landmark) => ({
    id: landmark.id,
    label: landmark.label,
    pointsTo: landmark.pointsTo,
    position: { ...landmark.position },
  }));
}

function sceneEntities(state) {
  if (state.sceneId === "storm-watch") {
    return {
      count: 4,
      byType: { bert: 1, seedlingBeds: 3 },
      state: {
        storm: { stage: state.stormStage },
        seedlingBeds: { count: 3, covered: state.seedlingsCovered, battered: state.seedlingsBattered },
      },
    };
  }
  if (state.sceneId === "hungry-hens") {
    return {
      count: 4,
      byType: { bert: 1, hens: 3 },
      state: {
        feeder: { full: state.feederFull, chuteJammed: state.chuteJammed, grainVisible: state.grainVisible },
        hens: { count: 3, fed: state.hensFed },
      },
    };
  }
  return {
    count: 4,
    byType: { bert: 1, tomatoBeds: 3 },
    state: {
      irrigation: { blocked: state.blocked, blockageRevealed: state.blockageRevealed },
      tomatoBeds: { count: 3, watered: state.cropsWatered },
    },
  };
}

const PATH_TILES = new Set(["1,2", "2,2", "2,3", "2,4", "2,5", "3,5", "4,5", "5,5", "5,4"]);

function tileType(x, y) {
  if (y === 3 && x >= 0 && x <= 8) return "channel";
  if ((x === 6 && y === 4) || (x === 7 && y === 4) || (x === 7 && y === 5)) return "soil";
  if (PATH_TILES.has(`${x},${y}`)) return "path";
  return "grass";
}

function tileColors(type, x, y) {
  if (type === "soil") {
    return { top: PALETTE.soilTop, left: PALETTE.soilLeft, right: PALETTE.soilRight };
  }
  if (type === "path") {
    return { top: PALETTE.pathTop, left: PALETTE.pathLeft, right: PALETTE.pathRight };
  }
  if (type === "channel") {
    return { top: "#9ab08b", left: "#59764a", right: "#48653f" };
  }
  const top = (x + y) % 2 === 0 ? PALETTE.grassTop : PALETTE.grassAlt;
  return { top, left: PALETTE.grassLeft, right: PALETTE.grassRight };
}

function polygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
}

function makeProjectedSegment(axis, gridStart, gridEnd, screenStart, screenEnd, evidence = {}) {
  return {
    axis,
    gridStart: { ...gridStart },
    gridEnd: { ...gridEnd },
    screenStart: { ...screenStart },
    screenEnd: { ...screenEnd },
    ...evidence,
  };
}

function summarizeProjectedSegments(segments, axes) {
  const axisNames = [...new Set(segments.map((segment) => segment.axis))].sort();
  let maxAxisErrorPx = 0;
  let maxJoinGapPx = 0;
  let maxRailPostGapPx = 0;
  let joinedPairCount = 0;

  for (const segment of segments) {
    const gridDelta = subtractPoints(segment.gridEnd, segment.gridStart);
    const expected = segment.axis === "x"
      ? scalePoint(axes.x, gridDelta.x)
      : scalePoint(axes.y, gridDelta.y);
    const renderedEdges = segment.renderedEdges ?? [{ start: segment.screenStart, end: segment.screenEnd }];
    for (const edge of renderedEdges) {
      const actual = subtractPoints(edge.end, edge.start);
      maxAxisErrorPx = Math.max(maxAxisErrorPx, pointDistance(actual, expected));
    }
    if (segment.postStart && segment.postEnd) {
      maxRailPostGapPx = Math.max(
        maxRailPostGapPx,
        pointDistance(segment.screenStart, segment.postStart),
        pointDistance(segment.screenEnd, segment.postEnd),
      );
    }
  }

  for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex += 1) {
      const left = segments[leftIndex];
      const right = segments[rightIndex];
      if (left.axis !== right.axis) continue;
      const forwardJoin = pointDistance(left.gridEnd, right.gridStart) <= 0.0001;
      const reverseJoin = pointDistance(right.gridEnd, left.gridStart) <= 0.0001;
      if (!forwardJoin && !reverseJoin) continue;
      joinedPairCount += 1;
      const joinEnd = forwardJoin ? (left.joinEnd ?? [left.screenEnd]) : (right.joinEnd ?? [right.screenEnd]);
      const joinStart = forwardJoin ? (right.joinStart ?? [right.screenStart]) : (left.joinStart ?? [left.screenStart]);
      for (let index = 0; index < Math.min(joinEnd.length, joinStart.length); index += 1) {
        maxJoinGapPx = Math.max(maxJoinGapPx, pointDistance(joinEnd[index], joinStart[index]));
      }
    }
  }

  return {
    axes: axisNames,
    segmentCount: segments.length,
    joinedPairCount,
    maxAxisErrorPx: roundMetric(maxAxisErrorPx),
    maxJoinGapPx: roundMetric(maxJoinGapPx),
    maxRailPostGapPx: roundMetric(maxRailPostGapPx),
  };
}

function subtractPoints(left, right) {
  return { x: left.x - right.x, y: left.y - right.y };
}

function scalePoint(point, scale) {
  return { x: point.x * scale, y: point.y * scale };
}

function pointDistance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function midpoint(left, right) {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function roundPoint(point) {
  return { x: roundMetric(point.x), y: roundMetric(point.y) };
}

function roundMetric(value) {
  return Math.round(value * 1000) / 1000;
}

function boundsForPoints(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    left: Math.round(Math.min(...xs)),
    top: Math.round(Math.min(...ys)),
    right: Math.round(Math.max(...xs)),
    bottom: Math.round(Math.max(...ys)),
    width: Math.round(Math.max(...xs) - Math.min(...xs)),
    height: Math.round(Math.max(...ys) - Math.min(...ys)),
  };
}

function expandBounds(bounds, padding) {
  return {
    left: Math.round(bounds.left - padding),
    top: Math.round(bounds.top - padding),
    right: Math.round(bounds.right + padding),
    bottom: Math.round(bounds.bottom + padding),
    width: Math.round(bounds.width + padding * 2),
    height: Math.round(bounds.height + padding * 2),
  };
}

function mergeBounds(bounds) {
  if (bounds.length === 0) return null;
  return boundsForPoints(
    bounds.flatMap((rect) => [
      { x: rect.left, y: rect.top },
      { x: rect.right, y: rect.bottom },
    ]),
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lighten(hex, amount) {
  return shiftColor(hex, amount);
}

function darken(hex, amount) {
  return shiftColor(hex, -amount);
}

function shiftColor(hex, amount) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const red = clamp((value >> 16) + amount, 0, 255);
  const green = clamp(((value >> 8) & 0xff) + amount, 0, 255);
  const blue = clamp((value & 0xff) + amount, 0, 255);
  return `#${[red, green, blue].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}
