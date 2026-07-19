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
});

const MAP_WIDTH = 9;
const MAP_HEIGHT = 7;

export const IRRIGATION_SIGN = Object.freeze({
  id: "irrigation-sign",
  label: "IRRIGATION",
  pointsTo: "East Channel",
  position: Object.freeze({ x: 2.75, y: 2.45 }),
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
    const ctx = this.context;
    this.frameStats = {
      voxelCount: 0,
      terrainElevations: new Set(),
      propCount: STATIC_PROPS.length,
      propFamilies: PROP_FAMILIES,
      bert: null,
    };
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackdrop(timeMs);
    this.drawFarmShadow();

    for (let depth = 0; depth <= MAP_WIDTH + MAP_HEIGHT - 2; depth += 1) {
      for (let y = 0; y < MAP_HEIGHT; y += 1) {
        const x = depth - y;
        if (x < 0 || x >= MAP_WIDTH) continue;
        this.drawGroundTile(x, y, state, timeMs);
      }
    }

    if (state.routeVisible && state.route.length > 1) this.drawRoute(state.route, timeMs);

    const props = [...STATIC_PROPS, { type: "bert", x: state.bert.x, y: state.bert.y, depthOffset: 0.08, bert: state.bert }];
    props.sort((a, b) => a.x + a.y + (a.depthOffset ?? 0) - (b.x + b.y + (b.depthOffset ?? 0)));
    for (const prop of props) this.drawProp(prop, state, timeMs);

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
      farm: {
        grid: { width: MAP_WIDTH, height: MAP_HEIGHT },
        elevationLayers: this.frameStats?.terrainElevations?.size ?? 0,
        voxelCount: this.frameStats?.voxelCount ?? 0,
        propCount: this.frameStats?.propCount ?? 0,
        propFamilies: [...(this.frameStats?.propFamilies ?? [])],
        screenBounds: boundsForPoints(corners),
      },
      bert: this.frameStats?.bert ? structuredClone(this.frameStats.bert) : null,
    };
  }

  drawBackdrop(timeMs) {
    const ctx = this.context;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, PALETTE.skyLight);
    gradient.addColorStop(0.42, PALETTE.sky);
    gradient.addColorStop(1, PALETTE.skyDeep);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    const sunX = this.width * 0.83;
    const sunY = this.height * 0.14;
    const sunSize = clamp(this.tileWidth * 0.82, 44, 58);
    ctx.fillStyle = "rgba(245, 189, 63, 0.16)";
    ctx.fillRect(sunX - sunSize * 0.82, sunY - sunSize * 0.82, sunSize * 1.64, sunSize * 1.64);
    ctx.fillStyle = PALETTE.sun;
    ctx.fillRect(sunX - sunSize / 2, sunY - sunSize / 2, sunSize, sunSize);
    ctx.fillStyle = PALETTE.sunLight;
    ctx.fillRect(sunX - sunSize * 0.34, sunY - sunSize * 0.34, sunSize * 0.28, sunSize * 0.28);

    const drift = this.reducedMotion ? 0 : Math.sin(timeMs / 9000) * 9;
    this.drawCloud(this.width * 0.58 + drift, this.height * 0.11, 0.85);
    this.drawCloud(this.width * 0.17 - drift * 0.5, this.height * 0.22, 0.58);

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
    const center = this.project(x, y, 0.19);
    const halfW = this.tileWidth * 0.46;
    const halfH = this.tileHeight * 0.28;
    ctx.fillStyle = flowing ? PALETTE.water : PALETTE.channelDry;
    ctx.strokeStyle = "rgba(29, 43, 34, 0.55)";
    ctx.lineWidth = 1;
    polygon(ctx, [
      { x: center.x - halfW, y: center.y - halfH },
      { x: center.x + halfW, y: center.y + halfH },
      { x: center.x + halfW - 7, y: center.y + halfH + 4 },
      { x: center.x - halfW - 7, y: center.y - halfH + 4 },
    ]);
    ctx.fill();
    ctx.stroke();

    if (!flowing) {
      ctx.strokeStyle = "rgba(43, 58, 51, 0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(center.x - 10, center.y - 2);
      ctx.lineTo(center.x - 3, center.y + 2);
      ctx.lineTo(center.x + 3, center.y - 1);
      ctx.lineTo(center.x + 10, center.y + 4);
      ctx.stroke();
      return;
    }
    const flow = this.reducedMotion ? 0.5 : ((timeMs / 850 + x * 0.21) % 1);
    const start = this.project(x - 0.31 + flow * 0.42, y, 0.2);
    ctx.strokeStyle = PALETTE.waterLight;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(start.x - 8, start.y - 4);
    ctx.lineTo(start.x + 4, start.y + 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(25, 93, 116, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(center.x - 14, center.y - 7);
    ctx.lineTo(center.x + 13, center.y + 7);
    ctx.stroke();
  }

  drawChannelBanks(x, y) {
    const stone = (x % 2 === 0)
      ? { top: "#a0aa89", left: PALETTE.stoneLeft, right: PALETTE.stoneRight }
      : { top: PALETTE.stoneTop, left: "#4d5a48", right: "#39463a" };
    this.drawSmallCube(x - 0.31, y - 0.29, 0.27, 0.16, 0.11, stone);
    this.drawSmallCube(x + 0.31, y + 0.29, 0.27, 0.16, 0.11, stone);
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
        this.drawSign(prop.x, prop.y, prop.label);
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
    const p = this.project(x, y, 0.27);
    const length = this.tileWidth * 0.39;
    const dy = this.tileHeight * 0.2;
    const postOffset = axis === "x" ? 0.38 : -0.38;
    this.drawSmallCube(x - postOffset, y - Math.abs(postOffset) * 0.52, 0.72, 0.1, 0.52, {
      top: "#ffe0a2",
      left: "#b47a44",
      right: "#865335",
    });
    this.drawSmallCube(x + postOffset, y + Math.abs(postOffset) * 0.52, 0.72, 0.1, 0.52, {
      top: "#ffe0a2",
      left: "#b47a44",
      right: "#865335",
    });
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 7;
    ctx.lineCap = "square";
    ctx.beginPath();
    if (axis === "x") {
      ctx.moveTo(p.x - length, p.y - dy - 7);
      ctx.lineTo(p.x + length, p.y + dy - 7);
      ctx.moveTo(p.x - length, p.y - dy + 2);
      ctx.lineTo(p.x + length, p.y + dy + 2);
    } else {
      ctx.moveTo(p.x - length, p.y + dy - 7);
      ctx.lineTo(p.x + length, p.y - dy - 7);
      ctx.moveTo(p.x - length, p.y + dy + 2);
      ctx.lineTo(p.x + length, p.y - dy + 2);
    }
    ctx.stroke();
    ctx.strokeStyle = "#efcd8d";
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  drawSign(x, y, label) {
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

    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(boardLeft + 3, boardTop + 3, 4, boardHeight - 6);

    ctx.fillStyle = PALETTE.ink;
    ctx.font = `800 ${clamp(this.tileWidth / 8.6, 7, 9)}px ${this.monoFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, p.x + 3, boardTop + boardHeight / 2 + 0.5);

    ctx.fillStyle = PALETTE.water;
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
    const isWorking = bert.action === "inspect" || bert.action === "clear" || bert.action === "water";
    const isVerified = worldState.cropsWatered === 3 && !bert.moving;
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

    if (bert.action === "clear" || bert.action === "inspect") {
      renderedBounds.push(this.drawWrench(x, y, z, timeMs, bert.action));
      renderedParts.add("tool");
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
  return {
    blocked: state.blocked !== false,
    blockageRevealed: Boolean(state.blockageRevealed),
    cropsWatered: clamp(Number(state.cropsWatered ?? 0), 0, 3),
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

function createProps() {
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
    { type: "debris", x: 4.1, y: 3.02, depthOffset: 0.1 },
    { type: "crop", x: 6.15, y: 4.28, index: 0 },
    { type: "crop", x: 7.12, y: 4.22, index: 1 },
    { type: "crop", x: 7.05, y: 5.18, index: 2 },
    { type: "fence", x: 2.2, y: 6.15, axis: "x" },
    { type: "fence", x: 3.2, y: 6.15, axis: "x" },
    { type: "fence", x: 5.2, y: 6.15, axis: "x" },
    { type: "fence", x: 6.2, y: 6.15, axis: "x" },
    { type: "fence", x: 8.15, y: 2.1, axis: "y" },
    { type: "fence", x: 8.15, y: 3.1, axis: "y" },
    {
      type: "sign",
      x: IRRIGATION_SIGN.position.x,
      y: IRRIGATION_SIGN.position.y,
      label: IRRIGATION_SIGN.label,
    },
  ];
}

const STATIC_PROPS = Object.freeze(createProps().map((prop) => Object.freeze(prop)));
const PROP_FAMILIES = Object.freeze([...new Set(STATIC_PROPS.map((prop) => prop.type))].sort());

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
