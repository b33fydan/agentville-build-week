const PALETTE = Object.freeze({
  ink: "#1d2b22",
  sky: "#b9d9ce",
  skyLight: "#e8efcf",
  sun: "#f4c64f",
  cloud: "#fff6dc",
  grassTop: "#82ae58",
  grassLeft: "#5e843f",
  grassRight: "#4d7137",
  grassAlt: "#8bb960",
  soilTop: "#98613d",
  soilLeft: "#70452e",
  soilRight: "#5b3928",
  pathTop: "#d7b477",
  pathLeft: "#a27a4f",
  pathRight: "#896341",
  water: "#3da8c3",
  waterLight: "#81deec",
  channelDry: "#78948c",
  woodTop: "#c37a3e",
  woodLeft: "#8d4f2d",
  woodRight: "#713d28",
  roofTop: "#e36d3b",
  roofLeft: "#a5432f",
  roofRight: "#813528",
  cropDry: "#b68a46",
  cropWet: "#4f9c4d",
  tomato: "#ef653f",
  cyan: "#67d9e7",
  paper: "#fff8df",
});

const MAP_WIDTH = 9;
const MAP_HEIGHT = 7;

export const IRRIGATION_SIGN = Object.freeze({
  id: "irrigation-sign",
  label: "IRRIGATION",
  pointsTo: "East Channel",
  position: Object.freeze({ x: 2.75, y: 2.45 }),
});

export class FarmRenderer {
  constructor(canvas) {
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
    this.resizeObserver = new ResizeObserver(() => this.resize());
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

    const horizontalFit = this.width / 12.8;
    const verticalFit = this.height / 12.2;
    this.tileWidth = clamp(Math.min(horizontalFit, verticalFit * 2), 49, 76);
    this.tileHeight = this.tileWidth * 0.5;
    this.unitZ = this.tileHeight * 0.9;
    this.originX = this.width * 0.54;
    this.originY = Math.max(this.height * 0.19, 112);
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

    const props = createProps(state);
    props.sort((a, b) => a.x + a.y + (a.depthOffset ?? 0) - (b.x + b.y + (b.depthOffset ?? 0)));
    for (const prop of props) this.drawProp(prop, state, timeMs);

    this.drawBert(state.bert, timeMs);
    this.drawForegroundVignette();
  }

  drawBackdrop(timeMs) {
    const ctx = this.context;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, PALETTE.skyLight);
    gradient.addColorStop(0.56, PALETTE.sky);
    gradient.addColorStop(1, "#89b39a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    const sunX = this.width * 0.83;
    const sunY = this.height * 0.14;
    ctx.fillStyle = "rgba(244, 198, 79, 0.2)";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 31, 0, Math.PI * 2);
    ctx.fill();

    const drift = this.reducedMotion ? 0 : Math.sin(timeMs / 9000) * 9;
    this.drawCloud(this.width * 0.58 + drift, this.height * 0.11, 0.85);
    this.drawCloud(this.width * 0.17 - drift * 0.5, this.height * 0.22, 0.58);

    ctx.fillStyle = "#729b72";
    ctx.beginPath();
    ctx.moveTo(0, this.height * 0.51);
    for (let x = 0; x <= this.width; x += 70) {
      ctx.lineTo(x, this.height * 0.42 + Math.sin(x * 0.018) * 23);
    }
    ctx.lineTo(this.width, this.height);
    ctx.lineTo(0, this.height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#628b67";
    ctx.beginPath();
    ctx.moveTo(0, this.height * 0.56);
    for (let x = 0; x <= this.width; x += 55) {
      ctx.lineTo(x, this.height * 0.5 + Math.cos(x * 0.024) * 17);
    }
    ctx.lineTo(this.width, this.height);
    ctx.lineTo(0, this.height);
    ctx.closePath();
    ctx.fill();
  }

  drawCloud(x, y, scale) {
    const ctx = this.context;
    ctx.fillStyle = "rgba(255, 248, 223, 0.83)";
    ctx.beginPath();
    ctx.ellipse(x, y, 43 * scale, 13 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 23 * scale, y + 4 * scale, 26 * scale, 10 * scale, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 22 * scale, y + 3 * scale, 31 * scale, 11 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawFarmShadow() {
    const ctx = this.context;
    const a = this.project(-0.5, 0);
    const b = this.project(MAP_WIDTH - 0.2, -0.2);
    const c = this.project(MAP_WIDTH - 0.2, MAP_HEIGHT + 0.35);
    const d = this.project(-0.5, MAP_HEIGHT + 0.35);
    ctx.fillStyle = "rgba(29, 43, 34, 0.17)";
    polygon(ctx, [
      { x: a.x + 13, y: a.y + 24 },
      { x: b.x + 13, y: b.y + 24 },
      { x: c.x + 13, y: c.y + 24 },
      { x: d.x + 13, y: d.y + 24 },
    ]);
    ctx.fill();
  }

  drawGroundTile(x, y, state, timeMs) {
    const type = tileType(x, y);
    const colors = tileColors(type, x, y);
    this.drawIsoCube(x, y, 0, 0.18, colors, 0.98);

    if (type === "channel") {
      const upstream = x <= 4;
      const flowing = upstream || !state.blocked;
      this.drawChannelSurface(x, y, flowing, state, timeMs);
    }

    if (type === "soil") this.drawSoilFurrows(x, y, state);
    if ((x + y * 3) % 5 === 0 && type === "grass") this.drawGrassTuft(x, y);
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

    if (!flowing) return;
    const flow = this.reducedMotion ? 0.5 : ((timeMs / 850 + x * 0.21) % 1);
    const start = this.project(x - 0.31 + flow * 0.42, y, 0.2);
    ctx.strokeStyle = PALETTE.waterLight;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(start.x - 8, start.y - 4);
    ctx.lineTo(start.x + 4, start.y + 2);
    ctx.stroke();
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
    ctx.strokeStyle = "rgba(45, 99, 50, 0.75)";
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(p.x + i * 3, p.y);
      ctx.lineTo(p.x + i * 4, p.y - 5 - Math.abs(i));
      ctx.stroke();
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
        if (state.blocked) this.drawDebris(prop.x, prop.y, timeMs);
        else this.drawClearedDebris(prop.x, prop.y);
        break;
      case "fence":
        this.drawFence(prop.x, prop.y, prop.axis);
        break;
      case "sign":
        this.drawSign(prop.x, prop.y, prop.label);
        break;
      default:
        break;
    }
  }

  drawShed(x, y) {
    this.drawSmallCube(x, y, 0.22, 0.75, 0.85, {
      top: "#f2c06c",
      left: "#b56537",
      right: "#93472f",
    });
    this.drawSmallCube(x, y, 1.04, 0.93, 0.24, {
      top: PALETTE.roofTop,
      left: PALETTE.roofLeft,
      right: PALETTE.roofRight,
    });
    const door = this.project(x + 0.19, y + 0.21, 0.54);
    const ctx = this.context;
    ctx.fillStyle = "#17352c";
    ctx.fillRect(door.x - 5, door.y - 12, 10, 19);
    ctx.fillStyle = PALETTE.sun;
    ctx.fillRect(door.x + 2, door.y - 3, 2, 2);
  }

  drawReservoir(x, y, timeMs) {
    const ctx = this.context;
    const base = this.project(x, y, 0.2);
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(base.x - 13, base.y + 3);
    ctx.lineTo(base.x - 18, base.y + 37);
    ctx.moveTo(base.x + 13, base.y + 3);
    ctx.lineTo(base.x + 18, base.y + 37);
    ctx.stroke();
    this.drawSmallCube(x, y, 1.22, 0.66, 0.54, {
      top: "#9ae4e9",
      left: "#3d9ab0",
      right: "#2a7289",
    });
    const shimmer = this.reducedMotion ? 0 : Math.sin(timeMs / 500) * 2;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(base.x - 9 + shimmer, base.y - 38, 4, 15);
  }

  drawTree(x, y, scale) {
    this.drawSmallCube(x, y, 0.2, 0.16 * scale, 0.7 * scale, {
      top: "#996038",
      left: "#68442f",
      right: "#513326",
    });
    this.drawSmallCube(x, y, 0.82 * scale, 0.72 * scale, 0.46 * scale, {
      top: "#8fc05d",
      left: "#4f883f",
      right: "#3a6e37",
    });
    this.drawSmallCube(x - 0.14, y + 0.08, 1.19 * scale, 0.48 * scale, 0.3 * scale, {
      top: "#a3ca66",
      left: "#5b9345",
      right: "#46793c",
    });
  }

  drawCropBed(x, y, index, state, timeMs) {
    const watered = index < state.cropsWatered;
    const growth = watered ? 0.32 : 0.19;
    const sway = this.reducedMotion ? 0 : Math.sin(timeMs / 520 + index) * 0.025;
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
      if (watered) {
        this.drawSmallCube(x + dx + sway, y + dy, 0.23 + growth, 0.08, 0.09, {
          top: "#ff9d64",
          left: PALETTE.tomato,
          right: "#bc3e32",
        });
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

  drawDebris(x, y, timeMs) {
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

  drawFence(x, y, axis) {
    const ctx = this.context;
    const p = this.project(x, y, 0.27);
    const length = this.tileWidth * 0.39;
    const dy = this.tileHeight * 0.2;
    ctx.strokeStyle = "#f2d59c";
    ctx.lineWidth = 4;
    ctx.lineCap = "square";
    ctx.beginPath();
    if (axis === "x") {
      ctx.moveTo(p.x - length, p.y - dy);
      ctx.lineTo(p.x + length, p.y + dy);
    } else {
      ctx.moveTo(p.x - length, p.y + dy);
      ctx.lineTo(p.x + length, p.y - dy);
    }
    ctx.stroke();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
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
    ctx.font = `800 ${clamp(this.tileWidth / 8.6, 7, 9)}px ${getComputedStyle(document.documentElement).getPropertyValue("--mono")}`;
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

  drawBert(bert, timeMs) {
    const movingBob = bert.moving && !this.reducedMotion ? Math.abs(Math.sin(timeMs / 110)) * 0.09 : 0;
    const idleBob = !bert.moving && !this.reducedMotion ? Math.sin(timeMs / 700) * 0.025 : 0;
    const z = 0.27 + movingBob + idleBob;
    const x = bert.x;
    const y = bert.y;

    const shadow = this.project(x, y, 0.24);
    const ctx = this.context;
    ctx.fillStyle = "rgba(29, 43, 34, 0.25)";
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y + 3, this.tileWidth * 0.16, this.tileHeight * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();

    this.drawSmallCube(x - 0.08, y + 0.02, z, 0.11, 0.24, {
      top: "#3d5146",
      left: "#263b34",
      right: "#1d2b22",
    });
    this.drawSmallCube(x + 0.09, y - 0.01, z, 0.11, 0.24, {
      top: "#3d5146",
      left: "#263b34",
      right: "#1d2b22",
    });
    this.drawSmallCube(x, y, z + 0.23, 0.36, 0.48, {
      top: "#f39a4f",
      left: "#c55f37",
      right: "#9f472f",
    });
    this.drawSmallCube(x, y, z + 0.7, 0.29, 0.25, {
      top: "#ffe2ad",
      left: "#dca46d",
      right: "#bf8658",
    });
    this.drawSmallCube(x, y, z + 0.93, 0.39, 0.13, {
      top: "#f4c64f",
      left: "#c18d32",
      right: "#9d6b28",
    });

    const scarf = this.project(x + 0.13, y + 0.06, z + 0.67);
    ctx.fillStyle = "#39a7c2";
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
    ctx.fillRect(scarf.x - 4, scarf.y - 2, 8, 4);
    ctx.strokeRect(scarf.x - 4, scarf.y - 2, 8, 4);

    if (bert.action === "clear" || bert.action === "inspect") this.drawWrench(x, y, z, timeMs, bert.action);
  }

  drawWrench(x, y, z, timeMs, action) {
    const ctx = this.context;
    const p = this.project(x + 0.24, y - 0.03, z + 0.5);
    const swing = action === "clear" && !this.reducedMotion ? Math.sin(timeMs / 110) * 0.42 : -0.3;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(swing);
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(13, -10);
    ctx.stroke();
    ctx.strokeStyle = "#d7e0d8";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
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

function tileType(x, y) {
  if (y === 3 && x >= 0 && x <= 8) return "channel";
  if ((x === 6 && y === 4) || (x === 7 && y === 4) || (x === 7 && y === 5)) return "soil";
  const path = new Set(["1,2", "2,2", "2,3", "2,4", "2,5", "3,5", "4,5", "5,5", "5,4"]);
  if (path.has(`${x},${y}`)) return "path";
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
