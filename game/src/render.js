// Drawing the world: Port Kessel is painted once into a city-sized offscreen canvas (roads,
// kerbs, lane paint, parks, docks, buildings with lit windows and neon), then every frame blits
// the visible window of it and draws what moves on top — traffic with headlight cones, people
// with umbrellas, the player, gunfire, rain and the objective beam. HUD and menus live elsewhere.
import { CITY_SIZE, FONT, PALETTE, VEHICLES, VIEW } from './config.js';
import { hash2 } from './random.js';
import { drawHUD } from './hud.js';

const RAIN_COUNT = 150;

function rgba(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function rr(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function inView(world, x, y, margin = 120) {
  return x > world.camera.x - margin && x < world.camera.x + VIEW.width + margin &&
    y > world.camera.y - margin && y < world.camera.y + VIEW.height + margin;
}

function signGeometry(building) {
  const sign = building.sign;
  if (!sign) return null;
  if (sign.vertical) {
    const w = 15;
    const h = Math.min(56, building.h * 0.5);
    return {
      x: building.x + building.w - w - 4,
      y: building.y + building.h - building.elevation - h - 4,
      w, h, vertical: true, text: sign.text, color: sign.color, phase: sign.phase,
    };
  }
  const w = Math.min(104, building.w * 0.84);
  const h = 18;
  return {
    x: building.x + (building.w - w) / 2,
    y: building.y + building.h - building.elevation - h - 2,
    w, h, vertical: false, text: sign.text, color: sign.color, phase: sign.phase,
  };
}

function drawSignsOnBuilding(g, building) {
  const geometry = signGeometry(building);
  if (geometry) {
    g.save();
    g.fillStyle = 'rgba(4,6,10,0.92)';
    g.fillRect(geometry.x, geometry.y, geometry.w, geometry.h);
    g.strokeStyle = rgba(geometry.color, 0.5);
    g.lineWidth = 1;
    g.strokeRect(geometry.x + 0.5, geometry.y + 0.5, geometry.w - 1, geometry.h - 1);
    g.shadowColor = geometry.color;
    g.shadowBlur = 18;
    g.fillStyle = geometry.color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (geometry.vertical) {
      g.save();
      g.translate(geometry.x + geometry.w / 2, geometry.y + geometry.h / 2);
      g.rotate(-Math.PI / 2);
      g.font = `700 9px ${FONT}`;
      g.fillText(geometry.text, 0, 0, geometry.h - 8);
      g.restore();
    } else {
      g.font = `700 10px ${FONT}`;
      g.fillText(geometry.text, geometry.x + geometry.w / 2, geometry.y + geometry.h / 2 + 1, geometry.w - 8);
    }
    g.restore();
    g.save();
    g.globalCompositeOperation = 'lighter';
    const glow = g.createRadialGradient(geometry.x + geometry.w / 2, geometry.y + geometry.h / 2, 2, geometry.x + geometry.w / 2, geometry.y + geometry.h / 2, geometry.w * 0.9);
    glow.addColorStop(0, rgba(geometry.color, 0.3));
    glow.addColorStop(0.45, rgba(geometry.color, 0.09));
    glow.addColorStop(1, rgba(geometry.color, 0));
    g.fillStyle = glow;
    g.fillRect(geometry.x - geometry.w * 0.45, geometry.y - geometry.h * 1.4, geometry.w * 1.9, geometry.h * 3.6);
    g.restore();
  }
  if (building.billboard) {
    const billboard = building.billboard;
    const w = Math.min(118, building.w * 0.86);
    const h = 24;
    const x = building.x + (building.w - w) / 2;
    const y = building.y - building.elevation + 7;
    g.save();
    g.fillStyle = 'rgba(4,7,12,0.94)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = rgba(billboard.color, 0.55);
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.shadowColor = billboard.color;
    g.shadowBlur = 14;
    g.fillStyle = billboard.color;
    g.font = `700 11px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(billboard.text, x + w / 2, y + h / 2 + 1, w - 8);
    g.restore();
  }
}

function drawBuilding(g, building) {
  const elevation = building.elevation;
  const roofY = building.y - elevation;
  const wallTop = building.y + building.h - elevation;

  // South wall: the strip of facade the raised roof leaves visible.
  const wall = g.createLinearGradient(0, wallTop, 0, building.y + building.h);
  wall.addColorStop(0, 'rgba(46,58,76,0.5)');
  wall.addColorStop(1, 'rgba(8,11,17,0.9)');
  g.fillStyle = '#0a0f16';
  g.fillRect(building.x, wallTop, building.w, elevation);
  g.fillStyle = wall;
  g.fillRect(building.x, wallTop, building.w, elevation);

  const rows = building.windowsSouth.rows;
  const cols = building.windowsSouth.cols;
  const cellW = building.w / cols;
  const cellH = elevation / rows;
  const cells = building.windowsSouth.cells;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = cells[row * cols + col];
      if (!cell) continue;
      g.fillStyle = cell === 1 ? rgba(PALETTE.windowWarm, 0.78) : rgba(PALETTE.windowCool, 0.6);
      g.fillRect(
        building.x + col * cellW + cellW * 0.2,
        wallTop + row * cellH + cellH * 0.2,
        Math.max(1.5, cellW * 0.55),
        Math.max(1.5, cellH * 0.52),
      );
    }
  }

  // Roof.
  g.fillStyle = building.roof;
  g.fillRect(building.x, roofY, building.w, building.h);
  g.fillStyle = building.tone;
  g.globalAlpha = 0.45;
  g.fillRect(building.x, roofY, building.w, building.h);
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(170,200,230,0.18)';
  g.lineWidth = 1;
  g.strokeRect(building.x + 0.5, roofY + 0.5, building.w - 1, building.h - 1);
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.strokeRect(building.x + 4.5, roofY + 4.5, building.w - 9, building.h - 9);
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.lineWidth = 1;
  for (let seam = 22; seam < building.h; seam += 26) {
    g.beginPath();
    g.moveTo(building.x + 5, roofY + seam);
    g.lineTo(building.x + building.w - 5, roofY + seam);
    g.stroke();
  }
  g.strokeStyle = 'rgba(190,215,240,0.07)';
  g.beginPath();
  g.moveTo(building.x + 2, roofY + 2);
  g.lineTo(building.x + building.w - 2, roofY + 2);
  g.stroke();

  for (const prop of building.roofProps) {
    if (prop.kind === 'tank') {
      const radius = Math.max(3, Math.min(prop.w, prop.h) / 2);
      g.fillStyle = '#232b36';
      g.beginPath();
      g.arc(building.x + prop.x + radius, roofY + prop.y + radius, radius, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(190,210,230,0.18)';
      g.stroke();
    } else {
      g.fillStyle = prop.kind === 'unit' ? '#2a3240' : '#202834';
      g.fillRect(building.x + prop.x, roofY + prop.y, prop.w, prop.h);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(building.x + prop.x, roofY + prop.y, prop.w, 1.5);
    }
  }
  drawSignsOnBuilding(g, building);
}

function drawCityLayer(g, city) {
  g.fillStyle = PALETTE.asphalt;
  g.fillRect(0, 0, CITY_SIZE.width, CITY_SIZE.height);

  // Road corridors sit a shade above the base asphalt.
  g.fillStyle = '#0c1119';
  for (let i = 0; i <= 8; i += 1) {
    const x = CITY_SIZE.node(i);
    g.fillRect(x - 46, 0, 92, CITY_SIZE.quayTop);
  }
  for (let j = 0; j <= 8; j += 1) {
    const y = CITY_SIZE.node(j);
    g.fillRect(0, y - 46, CITY_SIZE.width, 92);
  }

  // The harbour.
  const water = g.createLinearGradient(0, CITY_SIZE.waterTop, 0, CITY_SIZE.height);
  water.addColorStop(0, '#0a2b38');
  water.addColorStop(0.25, PALETTE.waterMid);
  water.addColorStop(1, '#03080d');
  g.fillStyle = water;
  g.fillRect(0, CITY_SIZE.waterTop, CITY_SIZE.width, CITY_SIZE.height - CITY_SIZE.waterTop);
  for (let line = 0; line < 74; line += 1) {
    g.fillStyle = `rgba(90,195,215,${0.03 + hash2(line, 3) * 0.06})`;
    const y = CITY_SIZE.waterTop + 6 + line * 4.3;
    const x = 60 + hash2(line, 4) * 700;
    const width = 300 + hash2(line, 5) * 1500;
    g.fillRect(x, y, width, 1);
    if (line % 3 === 0) {
      g.fillStyle = 'rgba(130,225,240,0.07)';
      g.fillRect(x + width * 0.3, y + 1.6, width * 0.28, 1);
    }
  }
  // The quay's lights and the terminal smear down into the black water.
  for (const lamp of city.lamps) {
    if (lamp.y < CITY_SIZE.quayTop - 120) continue;
    const streak = g.createLinearGradient(0, CITY_SIZE.waterTop, 0, CITY_SIZE.waterTop + 180);
    streak.addColorStop(0, rgba(lamp.color, 0.46));
    streak.addColorStop(0.5, rgba(lamp.color, 0.16));
    streak.addColorStop(1, rgba(lamp.color, 0));
    g.fillStyle = streak;
    g.fillRect(lamp.x - 5, CITY_SIZE.waterTop, 10, 180);
    for (let dash = 0; dash < 11; dash += 1) {
      const wobble = Math.sin(dash * 1.7 + lamp.x * 0.013) * 3;
      g.fillStyle = rgba(lamp.color, 0.1 * (1 - dash / 12));
      g.fillRect(lamp.x - 3 + wobble, CITY_SIZE.waterTop + 8 + dash * 16, 7, 1.6);
    }
  }
  for (const buoy of [{ x: 420, color: '#ff5468' }, { x: 1580, color: '#62ffa6' }, { x: 2760, color: '#ff5468' }]) {
    const y = CITY_SIZE.waterTop + 54;
    const glow = g.createRadialGradient(buoy.x, y, 1, buoy.x, y, 34);
    glow.addColorStop(0, rgba(buoy.color, 0.5));
    glow.addColorStop(1, rgba(buoy.color, 0));
    g.fillStyle = glow;
    g.fillRect(buoy.x - 34, y - 34, 68, 68);
    g.fillStyle = buoy.color;
    g.beginPath();
    g.arc(buoy.x, y, 2.4, 0, Math.PI * 2);
    g.fill();
  }
  for (let index = 0; index < 26; index += 1) {
    const x = 200 + hash2(index, 41) * 2700;
    const y = CITY_SIZE.waterTop + 20 + hash2(index, 42) * 280;
    g.strokeStyle = 'rgba(140,220,240,0.055)';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(x, y, 8 + hash2(index, 43) * 22, 1.6 + hash2(index, 44) * 2.4, 0, 0, Math.PI * 2);
    g.stroke();
  }

  // Quay.
  g.fillStyle = '#121821';
  g.fillRect(0, CITY_SIZE.quayTop, CITY_SIZE.width, CITY_SIZE.waterTop - CITY_SIZE.quayTop);
  g.strokeStyle = 'rgba(255,255,255,0.035)';
  g.lineWidth = 1;
  for (let x = 0; x < CITY_SIZE.width; x += 74) {
    g.beginPath();
    g.moveTo(x, CITY_SIZE.quayTop);
    g.lineTo(x, CITY_SIZE.waterTop);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.055)';
  g.fillRect(0, CITY_SIZE.waterTop - 5, CITY_SIZE.width, 2);
  g.fillStyle = '#2b3342';
  g.fillRect(0, CITY_SIZE.waterTop - 9, CITY_SIZE.width, 3);

  // Piers reaching into the water.
  for (const pier of city.piers) {
    g.fillStyle = '#1b222b';
    g.fillRect(pier.x, pier.y, pier.w, pier.h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let step = 0; step < pier.h; step += 9) g.fillRect(pier.x + 3, pier.y + step, pier.w - 6, 1);
    g.fillStyle = '#0a0e13';
    for (let step = 0; step < pier.h; step += 18) {
      g.fillRect(pier.x - 2, pier.y + step, 3, 5);
      g.fillRect(pier.x + pier.w - 1, pier.y + step, 3, 5);
    }
  }

  // Blocks: sidewalk ring, inner ground, park and yard surfaces.
  for (const block of city.blocks) {
    g.fillStyle = PALETTE.sidewalk;
    g.fillRect(block.x, block.y, block.w, block.h);
    g.fillStyle = block.type === 'park' ? PALETTE.park : block.type === 'plaza' || block.type === 'square' ? '#181d27' : block.type === 'yard' ? '#12171e' : '#0f141e';
    g.fillRect(block.x + 18, block.y + 18, block.w - 36, block.h - 36);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1;
    g.strokeRect(block.x + 18.5, block.y + 18.5, block.w - 37, block.h - 37);
    g.strokeStyle = 'rgba(120,150,180,0.08)';
    for (let step = 30; step < block.w; step += 30) {
      g.beginPath();
      g.moveTo(block.x + step, block.y);
      g.lineTo(block.x + step, block.y + 18);
      g.moveTo(block.x + step, block.y + block.h - 18);
      g.lineTo(block.x + step, block.y + block.h);
      g.stroke();
    }
    if (block.type === 'park') {
      g.strokeStyle = 'rgba(180,190,160,0.16)';
      g.lineWidth = 10;
      g.beginPath();
      g.moveTo(block.x + block.w / 2, block.y + 18);
      g.lineTo(block.x + block.w / 2, block.y + block.h - 18);
      g.moveTo(block.x + 18, block.y + block.h / 2);
      g.lineTo(block.x + block.w - 18, block.y + block.h / 2);
      g.stroke();
      g.strokeStyle = 'rgba(120,140,110,0.2)';
      g.lineWidth = 2;
      for (let index = 0; index < 3; index += 1) {
        const radius = 26 + index * 18;
        g.beginPath();
        g.arc(block.x + block.w / 2, block.y + block.h / 2, radius, 0, Math.PI * 2);
        g.stroke();
      }
    }
    if (block.type === 'yard' || block.type === 'square' || block.type === 'plaza') {
      g.fillStyle = 'rgba(255,255,255,0.02)';
      for (let step = 24; step < block.w; step += 48) g.fillRect(block.x + step, block.y + 18, 1, block.h - 36);
    }
  }

  // Road paint: centre dashes, kerb lines, crossings and stop bars.
  g.save();
  g.strokeStyle = 'rgba(185,198,216,0.15)';
  g.lineWidth = 1.6;
  g.setLineDash([16, 24]);
  for (let i = 0; i <= 8; i += 1) {
    const x = CITY_SIZE.node(i);
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, CITY_SIZE.quayTop);
    g.stroke();
  }
  for (let j = 0; j <= 8; j += 1) {
    const y = CITY_SIZE.node(j);
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(CITY_SIZE.width, y);
    g.stroke();
  }
  g.restore();

  g.fillStyle = 'rgba(210,220,235,0.11)';
  for (let i = 0; i <= 8; i += 1) {
    const x = CITY_SIZE.node(i);
    g.fillRect(x - 45, 220, 1.5, CITY_SIZE.quayTop - 220);
    g.fillRect(x + 43, 220, 1.5, CITY_SIZE.quayTop - 220);
  }
  for (let j = 0; j <= 8; j += 1) {
    const y = CITY_SIZE.node(j);
    g.fillRect(220, y - 45, CITY_SIZE.width - 440, 1.5);
    g.fillRect(220, y + 43, CITY_SIZE.width - 440, 1.5);
  }

  // Zebra crossings and stop bars at each junction.
  for (let i = 0; i <= 8; i += 1) {
    for (let j = 0; j <= 8; j += 1) {
      const nx = CITY_SIZE.node(i);
      const ny = CITY_SIZE.node(j);
      g.fillStyle = 'rgba(215,225,238,0.13)';
      for (let bar = 0; bar < 5; bar += 1) {
        g.fillRect(nx - 38 + bar * 16, ny - 55, 8, 22);
        g.fillRect(nx - 38 + bar * 16, ny + 33, 8, 22);
        g.fillRect(nx - 55, ny - 38 + bar * 16, 22, 8);
        g.fillRect(nx + 33, ny - 38 + bar * 16, 22, 8);
      }
      g.fillStyle = 'rgba(230,238,248,0.16)';
      g.fillRect(nx - 42, ny - 27, 28, 2);
      g.fillRect(nx + 14, ny + 25, 28, 2);
      g.fillRect(nx - 27, ny + 14, 2, 28);
      g.fillRect(nx + 25, ny - 42, 2, 28);
    }
  }

  // Manholes, puddles and patches of wear.
  for (let index = 0; index < 340; index += 1) {
    const value = hash2(index, 11);
    const value2 = hash2(index, 12);
    const x = 230 + value * (CITY_SIZE.width - 460);
    const y = 230 + value2 * (CITY_SIZE.quayTop - 260);
    if (city.blockAt(x, y)) continue;
    if (index % 3 === 0) {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.beginPath();
      g.ellipse(x, y, 3 + hash2(index, 13) * 4, 3, hash2(index, 14) * Math.PI, 0, Math.PI * 2);
      g.fill();
    } else {
      const rx = 7 + hash2(index, 15) * 22;
      g.fillStyle = 'rgba(28,64,92,0.14)';
      g.beginPath();
      g.ellipse(x, y, rx, 2.5 + hash2(index, 16) * 5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(140,190,220,0.05)';
      g.fillRect(x - rx * 0.6, y - 1, rx * 0.5, 1);
    }
  }

  // Lamp light pools on the pavement and asphalt.
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const lamp of city.lamps) {
    const glow = g.createRadialGradient(lamp.x, lamp.y, 3, lamp.x, lamp.y, lamp.radius);
    glow.addColorStop(0, rgba(lamp.color, 0.27));
    glow.addColorStop(0.42, rgba(lamp.color, 0.12));
    glow.addColorStop(1, rgba(lamp.color, 0));
    g.fillStyle = glow;
    g.fillRect(lamp.x - lamp.radius, lamp.y - lamp.radius, lamp.radius * 2, lamp.radius * 2);
  }
  g.restore();

  for (const prop of city.props) {
    switch (prop.type) {
      case 'tree': {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.ellipse(prop.x + 5, prop.y + 6, prop.size * 0.9, prop.size * 0.55, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = prop.tint ? '#18352a' : '#1b3a2b';
        g.beginPath();
        g.arc(prop.x, prop.y, prop.size, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = prop.tint ? '#234a37' : '#27543c';
        g.beginPath();
        g.arc(prop.x - prop.size * 0.22, prop.y - prop.size * 0.24, prop.size * 0.62, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(140,220,170,0.1)';
        g.beginPath();
        g.arc(prop.x - prop.size * 0.3, prop.y - prop.size * 0.35, prop.size * 0.28, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'pond':
        g.fillStyle = '#0c2230';
        g.beginPath();
        g.ellipse(prop.x, prop.y, prop.rx, prop.ry, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(140,210,230,0.2)';
        g.lineWidth = 1.4;
        g.stroke();
        g.fillStyle = 'rgba(180,230,250,0.08)';
        g.beginPath();
        g.ellipse(prop.x - prop.rx * 0.2, prop.y - prop.ry * 0.2, prop.rx * 0.5, prop.ry * 0.4, 0, 0, Math.PI * 2);
        g.fill();
        break;
      case 'bench':
        g.save();
        g.translate(prop.x, prop.y);
        g.rotate(prop.angle);
        g.fillStyle = '#2d3542';
        g.fillRect(-10, -4, 20, 8);
        g.fillStyle = '#1b2029';
        g.fillRect(-10, -6, 20, 2);
        g.restore();
        break;
      case 'fountain': {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.arc(prop.x + 3, prop.y + 4, prop.r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#222b37';
        g.beginPath();
        g.arc(prop.x, prop.y, prop.r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#0d2634';
        g.beginPath();
        g.arc(prop.x, prop.y, prop.r - 4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(130,200,230,0.25)';
        g.stroke();
        g.fillStyle = 'rgba(180,230,255,0.35)';
        g.beginPath();
        g.arc(prop.x, prop.y, 2.5, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'stall':
        g.save();
        g.translate(prop.x, prop.y);
        g.rotate(prop.angle);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(-prop.w / 2 + 2, -prop.h / 2 + 3, prop.w, prop.h);
        g.fillStyle = prop.color;
        g.fillRect(-prop.w / 2, -prop.h / 2, prop.w, prop.h);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        for (let stripe = 0; stripe < 4; stripe += 1) g.fillRect(-prop.w / 2 + stripe * 7, -prop.h / 2, 3, prop.h);
        g.restore();
        break;
      case 'container':
        g.save();
        g.translate(prop.x + prop.w / 2, prop.y + prop.h / 2);
        g.rotate(prop.angle);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(-prop.w / 2 + 4, -prop.h / 2 + 5, prop.w, prop.h);
        g.fillStyle = prop.color;
        g.fillRect(-prop.w / 2, -prop.h / 2, prop.w, prop.h);
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.lineWidth = 1;
        for (let rib = -prop.w / 2 + 6; rib < prop.w / 2; rib += 7) g.strokeRect(rib, -prop.h / 2 + 2, 0.5, prop.h - 4);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(-prop.w / 2, -prop.h / 2, prop.w, 2);
        g.restore();
        break;
      case 'crate':
        g.save();
        g.translate(prop.x, prop.y);
        g.rotate(prop.angle);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(-prop.size / 2 + 2, -prop.size / 2 + 3, prop.size, prop.size);
        g.fillStyle = '#3a2e20';
        g.fillRect(-prop.size / 2, -prop.size / 2, prop.size, prop.size);
        g.strokeStyle = 'rgba(190,150,100,0.3)';
        g.strokeRect(-prop.size / 2 + 0.5, -prop.size / 2 + 0.5, prop.size - 1, prop.size - 1);
        g.restore();
        break;
      case 'dumpster':
        g.save();
        g.translate(prop.x, prop.y);
        g.rotate(prop.angle);
        g.fillStyle = '#26303b';
        g.fillRect(-13, -8, 26, 16);
        g.fillStyle = '#303c49';
        g.fillRect(-13, -10, 26, 3);
        g.restore();
        break;
      case 'bollard':
        g.fillStyle = '#3b4657';
        g.beginPath();
        g.arc(prop.x, prop.y, 3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,210,120,0.25)';
        g.beginPath();
        g.arc(prop.x, prop.y, 1.2, 0, Math.PI * 2);
        g.fill();
        break;
      case 'parking':
        g.fillStyle = 'rgba(255,255,255,0.035)';
        g.fillRect(prop.x, prop.y, prop.w, prop.h);
        g.strokeStyle = 'rgba(255,255,255,0.08)';
        g.lineWidth = 1;
        for (let bay = 0; bay < 4; bay += 1) {
          g.beginPath();
          g.moveTo(prop.x + 8, prop.y + 10 + bay * 20);
          g.lineTo(prop.x + prop.w - 8, prop.y + 10 + bay * 20);
          g.stroke();
        }
        break;
      case 'crane':
        g.save();
        g.translate(prop.x, prop.y);
        g.rotate(prop.angle);
        g.fillStyle = 'rgba(0,0,0,0.42)';
        g.fillRect(-12, -18, 168, 44);
        // Legs and the long gantry beam: a dockside silhouette that reads at speed.
        g.fillStyle = '#7d6730';
        g.fillRect(-8, -19, 12, 38);
        g.fillRect(124, -19, 12, 38);
        g.fillStyle = '#c9a23c';
        g.fillRect(-12, -9, 156, 18);
        g.fillStyle = '#e3bd58';
        g.fillRect(-12, -9, 156, 4);
        g.strokeStyle = 'rgba(70,52,18,0.6)';
        g.lineWidth = 1;
        for (let brace = 0; brace < 8; brace += 1) {
          g.beginPath();
          g.moveTo(-8 + brace * 19, -8);
          g.lineTo(-8 + brace * 19 + 19, 8);
          g.moveTo(-8 + brace * 19, 8);
          g.lineTo(-8 + brace * 19 + 19, -8);
          g.stroke();
        }
        // Cab, trolley and the container it is swinging over the water.
        g.fillStyle = '#d9b249';
        g.fillRect(-12, -27, 28, 18);
        g.fillStyle = 'rgba(20,30,42,0.9)';
        g.fillRect(-7, -24, 18, 8);
        g.fillStyle = '#e9c766';
        g.fillRect(92, -6, 20, 12);
        g.strokeStyle = 'rgba(20,20,20,0.8)';
        g.beginPath();
        g.moveTo(102, 6);
        g.lineTo(102, 26);
        g.stroke();
        g.fillStyle = '#4a6b58';
        g.fillRect(88, 24, 28, 12);
        g.strokeStyle = 'rgba(20,20,20,0.5)';
        g.strokeRect(88, 24, 28, 12);
        g.fillStyle = '#ff5a4a';
        g.beginPath();
        g.arc(140, -10, 2.6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,90,70,0.25)';
        g.beginPath();
        g.arc(140, -10, 10, 0, Math.PI * 2);
        g.fill();
        g.restore();
        break;
      case 'terminal': {
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(prop.x + 5, prop.y + 7, prop.w, prop.h);
        g.fillStyle = '#131b23';
        g.fillRect(prop.x, prop.y, prop.w, prop.h);
        g.fillStyle = '#1b252f';
        g.fillRect(prop.x + 3, prop.y + 3, prop.w - 6, prop.h - 6);
        g.fillStyle = 'rgba(255,210,120,0.14)';
        for (let door = 0; door < 3; door += 1) g.fillRect(prop.x + 14 + door * 52, prop.y + prop.h - 16, 34, 12);
        g.fillStyle = 'rgba(255,190,90,0.12)';
        g.fillRect(prop.x + 10, prop.y + 8, prop.w - 20, 4);
        g.fillStyle = '#ffcf7a';
        g.font = `700 10px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.shadowColor = '#ffb347';
        g.shadowBlur = 10;
        g.fillText('KETTLE TERMINAL', prop.x + prop.w / 2, prop.y + 24, prop.w - 18);
        g.shadowBlur = 0;
        break;
      }
      case 'barge': {
        g.save();
        g.translate(prop.x, prop.y);
        g.rotate(prop.angle);
        const glow = g.createLinearGradient(0, prop.h * 0.3, 0, prop.h * 2.4);
        glow.addColorStop(0, 'rgba(100,160,180,0.16)');
        glow.addColorStop(1, 'rgba(100,160,180,0)');
        g.fillStyle = glow;
        g.fillRect(-prop.w / 2, prop.h * 0.3, prop.w, prop.h * 2.1);
        g.fillStyle = prop.color || '#33424a';
        g.fillRect(-prop.w / 2, -prop.h / 2, prop.w, prop.h);
        g.strokeStyle = 'rgba(190,220,235,0.25)';
        g.strokeRect(-prop.w / 2, -prop.h / 2, prop.w, prop.h);
        for (let box = 0; box < 4; box += 1) {
          g.fillStyle = ['#3d4d54', '#4a3a2a', '#2c4034'][box % 3];
          g.fillRect(-prop.w / 2 + 8 + box * (prop.w - 16) / 4, -prop.h * 0.3, (prop.w - 20) / 4, prop.h * 0.6);
        }
        g.fillStyle = 'rgba(255,225,160,0.9)';
        g.fillRect(-prop.w / 2 + 4, -prop.h / 2 + 4, 2.5, 2.5);
        g.fillRect(prop.w / 2 - 6, -prop.h / 2 + 4, 2.5, 2.5);
        g.restore();
        break;
      }
      case 'boat': {
        g.save();
        g.translate(prop.x, prop.y);
        g.rotate(prop.angle);
        g.strokeStyle = 'rgba(150,220,235,0.18)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(-prop.w * 0.55, -prop.h * 0.3);
        g.lineTo(-prop.w * 1.3, -prop.h * 0.8);
        g.moveTo(-prop.w * 0.55, prop.h * 0.3);
        g.lineTo(-prop.w * 1.3, prop.h * 0.8);
        g.stroke();
        g.fillStyle = prop.color || '#2a3b45';
        g.beginPath();
        g.moveTo(-prop.w / 2, -prop.h / 2);
        g.lineTo(prop.w / 2 - 6, -prop.h * 0.3);
        g.lineTo(prop.w / 2, 0);
        g.lineTo(prop.w / 2 - 6, prop.h * 0.3);
        g.lineTo(-prop.w / 2, prop.h / 2);
        g.closePath();
        g.fill();
        g.fillStyle = '#3b4d57';
        g.fillRect(-prop.w * 0.16, -prop.h * 0.34, prop.w * 0.28, prop.h * 0.68);
        g.fillStyle = 'rgba(255,225,160,0.85)';
        g.fillRect(-prop.w * 0.12, -prop.h * 0.24, 3, 3);
        g.fillStyle = '#7dffa8';
        g.beginPath();
        g.arc(prop.w * 0.36, 0, 1.8, 0, Math.PI * 2);
        g.fill();
        g.restore();
        break;
      }
      case 'ship': {
        const reflection = g.createLinearGradient(0, prop.y + prop.h * 0.2, 0, prop.y + prop.h * 2.4);
        reflection.addColorStop(0, 'rgba(95,160,175,0.18)');
        reflection.addColorStop(0.5, 'rgba(70,120,135,0.08)');
        reflection.addColorStop(1, 'rgba(70,120,135,0)');
        g.fillStyle = reflection;
        g.fillRect(prop.x - prop.w * 0.42, prop.y + prop.h * 0.2, prop.w * 0.84, prop.h * 2.4);
        g.save();
        g.translate(prop.x, prop.y);
        g.rotate(prop.angle);
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.beginPath();
        g.ellipse(4, 7, prop.w * 0.52, prop.h * 0.34, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = prop.color || '#202b34';
        g.beginPath();
        g.moveTo(-prop.w / 2, -prop.h / 2);
        g.lineTo(prop.w / 2 - 18, -prop.h / 2);
        g.lineTo(prop.w / 2, 0);
        g.lineTo(prop.w / 2 - 18, prop.h / 2);
        g.lineTo(-prop.w / 2, prop.h / 2);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(190,225,240,0.35)';
        g.lineWidth = 1.2;
        g.stroke();
        g.fillStyle = '#2d3942';
        g.fillRect(-prop.w * 0.3, -prop.h * 0.2, 54, prop.h * 0.4);
        g.fillStyle = 'rgba(255,220,160,0.55)';
        for (let cabin = 0; cabin < 4; cabin += 1) g.fillRect(-prop.w * 0.28 + cabin * 11, -prop.h * 0.14, 6, 3);
        g.fillStyle = '#3d4d54';
        for (let box = 0; box < 4; box += 1) g.fillRect(prop.w * 0.04 + box * 17, -prop.h * 0.26, 13, prop.h * 0.52);
        g.fillStyle = 'rgba(255,230,170,0.95)';
        for (let light = 0; light < 4; light += 1) g.fillRect(-prop.w * 0.24 + light * 11, -prop.h * 0.3, 2.4, 2.4);
        g.fillStyle = '#ff6b57';
        g.beginPath();
        g.arc(prop.w / 2 - 20, 0, 2.6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,110,90,0.25)';
        g.beginPath();
        g.arc(prop.w / 2 - 20, 0, 10, 0, Math.PI * 2);
        g.fill();
        for (let ring = 1; ring <= 4; ring += 1) {
          g.strokeStyle = `rgba(150,214,230,${0.14 / ring})`;
          g.lineWidth = 1;
          g.beginPath();
          g.ellipse(-prop.w * 0.5 - ring * 9, 0, 18 + ring * 12, prop.h * 0.5 + ring * 5, 0, 0, Math.PI * 2);
          g.stroke();
        }
        g.strokeStyle = 'rgba(140,190,210,0.2)';
        g.beginPath();
        g.moveTo(-prop.w * 0.4, prop.h * 0.6);
        g.lineTo(prop.w * 0.4, prop.h * 0.6);
        g.stroke();
        g.restore();
        break;
      }
      case 'string':
        g.strokeStyle = 'rgba(255,190,120,0.22)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(prop.x1, prop.y1);
        g.quadraticCurveTo((prop.x1 + prop.x2) / 2, prop.y1 + 9, prop.x2, prop.y2);
        g.stroke();
        for (let step = 0.12; step < 1; step += 0.12) {
          const x = prop.x1 + (prop.x2 - prop.x1) * step;
          const y = prop.y1 + 9 * Math.sin(step * Math.PI);
          g.fillStyle = rgba(prop.color || PALETTE.sodium, 0.75);
          g.beginPath();
          g.arc(x, y, 1.3, 0, Math.PI * 2);
          g.fill();
        }
        break;
      default:
        break;
    }
  }

  // Hanging lights across the Lantern Strip.
  for (const string of city.strings) {
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(string.x, string.y - 52);
    g.quadraticCurveTo(string.x, string.y, string.x, string.y + 52);
    g.stroke();
    for (let index = 0; index < 11; index += 1) {
      const y = string.y - 48 + index * 9.6;
      g.fillStyle = rgba(string.color, 0.85);
      g.beginPath();
      g.arc(string.x, y, 1.9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = rgba(string.color, 0.12);
      g.beginPath();
      g.arc(string.x, y, 6, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Building shadows, then buildings themselves.
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.55)';
  g.shadowBlur = 16;
  g.shadowOffsetX = 9;
  g.shadowOffsetY = 11;
  g.fillStyle = 'rgba(0,0,0,0.001)';
  for (const building of city.buildings) g.fillRect(building.x, building.y, building.w, building.h);
  g.restore();
  for (const building of city.buildings) drawBuilding(g, building);

  // Neon smeared down the wet road under the signs.
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const building of city.buildings) {
    const geometry = signGeometry(building);
    if (!geometry) continue;
    const smear = g.createLinearGradient(0, building.y + building.h, 0, building.y + building.h + 64);
    smear.addColorStop(0, rgba(geometry.color, 0.27));
    smear.addColorStop(0.45, rgba(geometry.color, 0.1));
    smear.addColorStop(1, rgba(geometry.color, 0));
    g.fillStyle = smear;
    g.fillRect(geometry.x, building.y + building.h, geometry.w, 64);
  }
  g.restore();

  // Piers' lamps and a couple of moored hulks for the skyline.
  for (const pier of city.piers) {
    for (let index = 0; index < 3; index += 1) {
      const y = pier.y + 18 + index * 30;
      const glow = g.createRadialGradient(pier.x + pier.w / 2, y, 1, pier.x + pier.w / 2, y, 42);
      glow.addColorStop(0, 'rgba(255,200,120,0.22)');
      glow.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = glow;
      g.fillRect(pier.x - 20, y - 20, pier.w + 40, 40);
    }
    g.fillStyle = '#243039';
    g.fillRect(pier.x + pier.w / 2 - 1, pier.y + 8, 2, pier.h - 16);
  }
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;

  let layer = null;
  let layerFor = null;

  function ensureLayer(city) {
    if (layer && layerFor === city) return;
    layerFor = city;
    layer = document.createElement('canvas');
    layer.width = CITY_SIZE.width;
    layer.height = CITY_SIZE.height;
    const layerContext = layer.getContext('2d');
    drawCityLayer(layerContext, city);
  }

  function drawSkids(context, world) {
    for (const skid of world.skids) {
      if (!inView(world, skid.x, skid.y, 30)) continue;
      context.save();
      context.translate(skid.x, skid.y);
      context.rotate(skid.angle);
      context.fillStyle = `rgba(0,0,0,${Math.min(0.5, skid.life * 0.06)})`;
      context.fillRect(-8, -skid.width / 2, 16, skid.width);
      context.restore();
    }
  }

  function drawObjective(context, world) {
    if (!world.objective) return;
    const objective = world.objective;
    if (!inView(world, objective.x, objective.y, 260)) return;
    const pulse = 0.72 + Math.sin(world.time * 3.2) * 0.1;
    context.save();
    context.globalCompositeOperation = 'lighter';
    const beam = context.createLinearGradient(0, objective.y - 250, 0, objective.y);
    beam.addColorStop(0, 'rgba(255,209,92,0)');
    beam.addColorStop(0.6, 'rgba(255,209,92,0.08)');
    beam.addColorStop(1, 'rgba(255,209,92,0.3)');
    context.fillStyle = beam;
    context.fillRect(objective.x - 30, objective.y - 250, 60, 250);
    context.restore();

    context.save();
    context.strokeStyle = `rgba(255,209,92,${0.38 * pulse})`;
    context.lineWidth = 1.8;
    context.setLineDash([8, 8]);
    context.beginPath();
    context.ellipse(objective.x, objective.y, 54, 46, 0, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
    const glow = context.createRadialGradient(objective.x, objective.y, 2, objective.x, objective.y, 82);
    glow.addColorStop(0, `rgba(255,209,92,${0.24 * pulse})`);
    glow.addColorStop(1, 'rgba(255,209,92,0)');
    context.fillStyle = glow;
    context.fillRect(objective.x - 82, objective.y - 72, 164, 144);
    context.translate(objective.x, objective.y - 18 - Math.sin(world.time * 2.6) * 4);
    context.rotate(Math.PI / 4);
    context.fillStyle = PALETTE.marker;
    context.shadowColor = PALETTE.marker;
    context.shadowBlur = 18;
    context.fillRect(-11, -11, 22, 22);
    context.restore();
  }

  function drawHeadlights(context, world) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const car of world.cars) {
      if (!car.lightsOn || car.wrecked) continue;
      if (!inView(world, car.x, car.y, 260)) continue;
      context.save();
      context.translate(car.x, car.y);
      context.rotate(car.angle);
      const spec = VEHICLES[car.kind];
      const isPlayer = car.driver === 'player';
      const reach = isPlayer ? 300 : spec.police ? 235 : 208;
      const cone = context.createLinearGradient(spec.len * 0.4, 0, reach, 0);
      cone.addColorStop(0, isPlayer ? 'rgba(255,240,196,0.27)' : 'rgba(255,240,196,0.12)');
      cone.addColorStop(0.55, isPlayer ? 'rgba(255,238,190,0.09)' : 'rgba(255,238,190,0.04)');
      cone.addColorStop(1, 'rgba(255,238,190,0)');
      context.fillStyle = cone;
      context.beginPath();
      context.moveTo(spec.len * 0.42, -6);
      context.lineTo(reach, -62);
      context.lineTo(reach, 62);
      context.lineTo(spec.len * 0.42, 6);
      context.closePath();
      context.fill();
      context.restore();
    }
    context.restore();
    // Tail lights and lamp cores.
    for (const car of world.cars) {
      if (!inView(world, car.x, car.y, 60) || car.wrecked) continue;
      const spec = VEHICLES[car.kind];
      const cos = Math.cos(car.angle);
      const sin = Math.sin(car.angle);
      const fx = car.x + cos * spec.len * 0.5;
      const fy = car.y + sin * spec.len * 0.5;
      const rx = car.x - cos * spec.len * 0.5;
      const ry = car.y - sin * spec.len * 0.5;
      context.fillStyle = 'rgba(255,236,180,0.9)';
      context.beginPath();
      context.arc(fx - sin * 6, fy + cos * 6, 2.1, 0, Math.PI * 2);
      context.arc(fx + sin * 6, fy - cos * 6, 2.1, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,70,84,0.85)';
      context.beginPath();
      context.arc(rx - sin * 6, ry + cos * 6, 1.7, 0, Math.PI * 2);
      context.arc(rx + sin * 6, ry - cos * 6, 1.7, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPed(context, world, ped) {
    if (!inView(world, ped.x, ped.y, 40)) return;
    context.save();
    context.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.beginPath();
      context.ellipse(2, 3, 9, 6, ped.angle, 0, Math.PI * 2);
      context.fill();
      context.rotate(ped.angle);
      rr(context, -9, -4, 18, 8, 3);
      context.fillStyle = ped.coat;
      context.fill();
      rr(context, -10, -3.5, 6, 7, 3);
      context.fillStyle = ped.skin;
      context.fill();
      context.restore();
      return;
    }
    const bob = Math.sin(ped.bob) * 1.1;
    context.fillStyle = 'rgba(0,0,0,0.4)';
    context.beginPath();
    context.ellipse(2, 4, 7, 4.2, ped.angle, 0, Math.PI * 2);
    context.fill();
    context.rotate(ped.angle);
    context.translate(0, bob);
    if (ped.umbrella) {
      context.fillStyle = 'rgba(20,26,38,0.92)';
      context.beginPath();
      context.arc(0, -2, 9.5, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = rgba(ped.coat, 0.6);
      context.lineWidth = 1;
      context.stroke();
      context.fillStyle = 'rgba(190,215,240,0.15)';
      context.beginPath();
      context.arc(-2, -4, 5, 0, Math.PI * 2);
      context.fill();
    } else {
      rr(context, -3.4, -5.4, 6.8, 10.5, 3);
      context.fillStyle = ped.coat;
      context.fill();
      context.beginPath();
      context.arc(0.8, -7.4, 3.1, 0, Math.PI * 2);
      context.fillStyle = ped.skin;
      context.fill();
      context.beginPath();
      context.arc(0.2, -8.1, 3, Math.PI, Math.PI * 2);
      context.fillStyle = '#15161c';
      context.fill();
    }
    context.restore();
  }

  function drawCop(context, world, cop) {
    if (!inView(world, cop.x, cop.y, 40)) return;
    context.save();
    context.translate(cop.x, cop.y);
    if (cop.state === 'down') {
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.beginPath();
      context.ellipse(2, 3, 9, 6, cop.angle, 0, Math.PI * 2);
      context.fill();
      context.rotate(cop.angle);
      rr(context, -9, -4, 18, 8, 3);
      context.fillStyle = '#274a70';
      context.fill();
      context.restore();
      return;
    }
    context.rotate(cop.angle);
    context.fillStyle = 'rgba(0,0,0,0.4)';
    context.beginPath();
    context.ellipse(1, 4, 8, 5, 0, 0, Math.PI * 2);
    context.fill();
    rr(context, -4, -6.4, 8, 12.6, 3.5);
    context.fillStyle = '#2f5d96';
    context.fill();
    context.strokeStyle = 'rgba(185,224,255,0.7)';
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = '#15263b';
    context.fillRect(-4.2, -2, 8.4, 3.2);
    context.beginPath();
    context.arc(0.6, -7.4, 3.2, 0, Math.PI * 2);
    context.fillStyle = '#c99a78';
    context.fill();
    context.fillStyle = '#15263b';
    context.beginPath();
    context.arc(0.2, -8.2, 3.3, Math.PI, Math.PI * 2);
    context.fill();
    context.fillRect(-3.4, -9.4, 7, 1.6);
    context.fillStyle = '#e4ebf5';
    context.fillRect(3, -1, 9, 2.2);
    context.restore();
  }

  function drawPlayerOnFoot(context, world) {
    const player = world.player;
    if (!player.onFoot || player.dead) return;
    context.save();
    context.translate(player.x, player.y);
    const halo = context.createRadialGradient(0, 0, 2, 0, 0, 30);
    halo.addColorStop(0, 'rgba(80,240,220,0.32)');
    halo.addColorStop(0.55, 'rgba(80,240,220,0.1)');
    halo.addColorStop(1, 'rgba(80,240,220,0)');
    context.fillStyle = halo;
    context.fillRect(-32, -32, 64, 64);
    context.strokeStyle = 'rgba(180,255,248,0.6)';
    context.lineWidth = 1.4;
    context.beginPath();
    context.arc(0, 0, 16, 0, Math.PI * 2);
    context.stroke();
    context.scale(1.35, 1.35);
    context.rotate(player.angle);
    context.fillStyle = 'rgba(0,0,0,0.48)';
    context.beginPath();
    context.ellipse(1, 5, 10, 6, 0, 0, Math.PI * 2);
    context.fill();
    // Legs and body, drawn larger than the crowd so Vale reads at a glance.
    context.fillStyle = '#131c25';
    rr(context, -4.6, -2, 9.2, 12, 3.5);
    context.fill();
    rr(context, -5.6, -8.6, 11.2, 16, 4.5);
    context.fillStyle = '#f4fffc';
    context.fill();
    context.strokeStyle = 'rgba(7,48,50,0.92)';
    context.lineWidth = 1.4;
    context.stroke();
    context.fillStyle = 'rgba(16,105,110,0.9)';
    context.fillRect(-4.2, -4.5, 8.4, 7);
    context.fillStyle = '#2fe0cf';
    context.fillRect(-7.4, -6.4, 2.4, 8.5);
    context.fillRect(5, -6.4, 2.4, 8.5);
    context.beginPath();
    context.arc(1, -9.8, 4.2, 0, Math.PI * 2);
    context.fillStyle = '#c99a78';
    context.fill();
    context.beginPath();
    context.arc(0.4, -10.8, 3.9, Math.PI, Math.PI * 2);
    context.fillStyle = '#111722';
    context.fill();
    if (player.weapon === 'pistol') {
      context.fillStyle = '#e4ebf5';
      context.fillRect(4.5, -1.7, 14, 3.2);
      context.fillStyle = '#0a0f16';
      context.fillRect(10.5, -2.5, 4.4, 4.8);
    } else {
      context.fillStyle = '#c99a78';
      context.beginPath();
      context.arc(7, -3.4, 2.8, 0, Math.PI * 2);
      context.fill();
    }
    if (player.fireCooldown > PLAYER_FIRE_GLOW) {
      context.fillStyle = 'rgba(255,232,160,0.85)';
      context.beginPath();
      context.arc(21, 0, 4.2, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,210,120,0.18)';
      context.beginPath();
      context.arc(21, 0, 10, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    // A small chevron above Vale's head, so the player is unmistakable in a still.
    const float = Math.sin(world.time * 4.2) * 1.6;
    context.save();
    context.translate(player.x, player.y - 33 + float);
    context.fillStyle = 'rgba(190,255,248,0.96)';
    context.shadowColor = 'rgba(90,240,220,0.95)';
    context.shadowBlur = 10;
    context.beginPath();
    context.moveTo(0, 7);
    context.lineTo(7, -3.5);
    context.lineTo(-7, -3.5);
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawCar(context, world, car) {
    if (!inView(world, car.x, car.y, 100)) return;
    const spec = VEHICLES[car.kind];
    const speed = Math.hypot(car.vx, car.vy);
    const isPlayer = car.driver === 'player';

    if (isPlayer) {
      context.save();
      context.translate(car.x, car.y);
      context.scale(1, 0.62);
      const glow = context.createRadialGradient(0, 0, 4, 0, 0, spec.len * 0.95);
      glow.addColorStop(0, 'rgba(70,240,220,0.3)');
      glow.addColorStop(1, 'rgba(70,240,220,0)');
      context.fillStyle = glow;
      context.fillRect(-spec.len, -spec.len, spec.len * 2, spec.len * 2);
      context.restore();
    }
    if (speed > 140) {
      const cos = Math.cos(car.angle);
      const sin = Math.sin(car.angle);
      const backX = car.x - cos * spec.len * 0.55;
      const backY = car.y - sin * spec.len * 0.55;
      context.save();
      context.strokeStyle = 'rgba(170,242,255,0.36)';
      context.lineWidth = 1.7;
      context.beginPath();
      for (let index = 0; index < 5; index += 1) {
        const offset = (index - 2) * 6;
        const jitter = Math.sin(world.time * 40 + index * 2.1) * 3;
        const sx = backX - sin * offset + cos * jitter;
        const sy = backY + cos * offset + sin * jitter;
        const length = 24 + speed * 0.1 + (index % 2) * 10;
        context.moveTo(sx, sy);
        context.lineTo(sx - cos * length, sy - sin * length);
      }
      context.stroke();
      context.restore();
    }

    if (isPlayer && speed > 180) {
      context.save();
      context.translate(car.x, car.y);
      context.rotate(car.angle);
      context.globalCompositeOperation = 'lighter';
      const tail = context.createLinearGradient(-spec.len * 0.5, 0, -spec.len * 0.5 - 140, 0);
      tail.addColorStop(0, 'rgba(190,235,250,0.2)');
      tail.addColorStop(0.45, 'rgba(170,220,240,0.07)');
      tail.addColorStop(1, 'rgba(170,220,240,0)');
      context.fillStyle = tail;
      context.beginPath();
      context.moveTo(-spec.len * 0.46, -spec.wid * 0.32);
      context.lineTo(-spec.len * 0.46 - 136, -spec.wid * 0.95);
      context.lineTo(-spec.len * 0.46 - 136, spec.wid * 0.95);
      context.lineTo(-spec.len * 0.46, spec.wid * 0.32);
      context.closePath();
      context.fill();
      for (const side of [-1, 1]) {
        const jet = context.createLinearGradient(-spec.len * 0.5, side * spec.wid * 0.3, -spec.len * 0.5 - 110, side * spec.wid * 0.8);
        jet.addColorStop(0, 'rgba(220,248,255,0.55)');
        jet.addColorStop(1, 'rgba(220,248,255,0)');
        context.strokeStyle = jet;
        context.lineWidth = 2.2;
        context.beginPath();
        context.moveTo(-spec.len * 0.46, side * spec.wid * 0.28);
        context.lineTo(-spec.len * 0.46 - 100, side * spec.wid * 0.78);
        context.stroke();
      }
      context.restore();
    }

    context.save();
    context.translate(car.x + 3, car.y + 5);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0,0,0,0.42)';
    rr(context, -spec.len / 2, -spec.wid / 2, spec.len, spec.wid, 5);
    context.fill();
    context.restore();

    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    rr(context, -spec.len / 2, -spec.wid / 2, spec.len, spec.wid, 4.5);
    context.fillStyle = car.wrecked ? '#1a1b1d' : car.fill;
    context.fill();
    context.strokeStyle = 'rgba(10,14,20,0.75)';
    context.lineWidth = 1.2;
    context.stroke();
    if (isPlayer) {
      rr(context, -spec.len / 2, -spec.wid / 2, spec.len, spec.wid, 4.5);
      context.strokeStyle = 'rgba(130,255,240,0.62)';
      context.lineWidth = 1.6;
      context.stroke();
    }
    rr(context, -spec.len * 0.14, -spec.wid * 0.32, spec.len * 0.38, spec.wid * 0.64, 3);
    context.fillStyle = car.wrecked ? '#101113' : (car.roof || spec.roof);
    context.fill();
    if (isPlayer && !car.wrecked) {
      context.fillStyle = 'rgba(238,255,251,0.78)';
      context.fillRect(-spec.len * 0.12, -2.4, spec.len * 0.34, 4.8);
    }
    context.fillStyle = 'rgba(160,210,235,0.34)';
    context.beginPath();
    context.moveTo(spec.len * 0.2, -spec.wid * 0.24);
    context.lineTo(spec.len * 0.3, -spec.wid * 0.29);
    context.lineTo(spec.len * 0.3, spec.wid * 0.29);
    context.lineTo(spec.len * 0.2, spec.wid * 0.24);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(20,30,42,0.6)';
    context.fillRect(-spec.len * 0.46, -spec.wid * 0.36, 4, spec.wid * 0.72);
    context.fillStyle = '#0b0e12';
    for (const side of [-1, 1]) {
      for (const wheel of [-1, 1]) {
        context.fillRect(spec.len * wheel * 0.3 - 4, side * spec.wid * 0.46, 8, 3.5);
      }
    }
    if (car.police) {
      context.fillStyle = '#eaf2fb';
      context.fillRect(-spec.len * 0.38, -spec.wid * 0.5 - 0.4, spec.len * 0.34, 3.6);
      context.fillRect(-spec.len * 0.38, spec.wid * 0.5 - 3.2, spec.len * 0.34, 3.6);
      context.fillStyle = '#2f5d96';
      context.fillRect(-spec.len * 0.38, -spec.wid * 0.5 - 0.4, spec.len * 0.34, 1.2);
      context.fillRect(-spec.len * 0.38, spec.wid * 0.5 - 3.2, spec.len * 0.34, 1.2);
      const flash = Math.sin(world.time * 9 + car.id) > 0;
      const first = flash ? PALETTE.sirenRed : PALETTE.sirenBlue;
      const second = flash ? PALETTE.sirenBlue : PALETTE.sirenRed;
      context.fillStyle = '#090c11';
      context.fillRect(-4, -spec.wid * 0.44, 9, spec.wid * 0.88);
      context.fillStyle = first;
      context.fillRect(-3, -spec.wid * 0.42, 7, spec.wid * 0.41);
      context.fillStyle = second;
      context.fillRect(-3, spec.wid * 0.01, 7, spec.wid * 0.41);
      context.shadowColor = first;
      context.shadowBlur = 14;
      context.fillRect(-3, -spec.wid * 0.42, 7, spec.wid * 0.41);
      context.shadowColor = second;
      context.fillRect(-3, spec.wid * 0.01, 7, spec.wid * 0.41);
      context.shadowBlur = 0;
      if (flash) {
        context.fillStyle = 'rgba(255,255,255,0.92)';
        context.fillRect(-2, -spec.wid * 0.4, 5, spec.wid * 0.18);
      }
    }
    if (car.health < car.maxHealth * 0.55) {
      context.fillStyle = 'rgba(12,14,18,0.55)';
      context.fillRect(-spec.len * 0.32, -spec.wid * 0.3, 7, 5);
      context.fillRect(2, spec.wid * 0.1, 9, 4);
    }
    if (car.wrecked) {
      context.fillStyle = `rgba(255,140,60,${0.18 + Math.sin(world.time * 9) * 0.06})`;
      context.beginPath();
      context.arc(spec.len * 0.24, 0, 8, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    if (car.police && car.lightsOn) {
      const red = Math.floor(world.time * 8 + (car.id || 0) * 0.7) % 2 === 0;
      const tint = red ? [255, 46, 70] : [64, 140, 255];
      context.save();
      context.globalCompositeOperation = 'lighter';
      const pool = context.createRadialGradient(car.x, car.y, 2, car.x, car.y, 138);
      pool.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},0.55)`);
      pool.addColorStop(0.35, `rgba(${tint[0]},${tint[1]},${tint[2]},0.22)`);
      pool.addColorStop(1, `rgba(${tint[0]},${tint[1]},${tint[2]},0)`);
      context.fillStyle = pool;
      context.beginPath();
      context.arc(car.x, car.y, 138, 0, Math.PI * 2);
      context.fill();
      const barX = car.x + Math.cos(car.angle) * -4;
      const barY = car.y + Math.sin(car.angle) * -4;
      const core = context.createRadialGradient(barX, barY, 1, barX, barY, 26);
      core.addColorStop(0, `rgba(255,255,255,0.85)`);
      core.addColorStop(0.25, `rgba(${tint[0]},${tint[1]},${tint[2]},0.75)`);
      core.addColorStop(1, `rgba(${tint[0]},${tint[1]},${tint[2]},0)`);
      context.fillStyle = core;
      context.fillRect(barX - 26, barY - 26, 52, 52);
      context.restore();
    }

    if (isPlayer) {
      const bob = Math.sin(world.time * 3.6) * 2;
      context.save();
      context.translate(car.x, car.y - 34 + bob);
      context.fillStyle = 'rgba(170,255,245,0.96)';
      context.shadowColor = 'rgba(90,240,220,0.95)';
      context.shadowBlur = 11;
      context.beginPath();
      context.moveTo(0, 8);
      context.lineTo(9, -4);
      context.lineTo(-9, -4);
      context.closePath();
      context.fill();
      context.restore();
    }
  }

  function drawBullets(context, world) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    context.lineWidth = 2.4;
    context.shadowBlur = 7;
    for (const bullet of world.bullets) {
      const color = bullet.owner === 'player' ? '#fff2b8' : '#ff9a86';
      context.strokeStyle = color;
      context.shadowColor = color;
      context.beginPath();
      context.moveTo(bullet.x - bullet.vx * 0.028, bullet.y - bullet.vy * 0.028);
      context.lineTo(bullet.x, bullet.y);
      context.stroke();
    }
    context.shadowBlur = 0;
    context.restore();
  }

  function drawParticles(context, world) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const particle of world.particles) {
      if (particle.kind === 'smoke') continue;
      if (particle.kind === 'muzzle') {
        const alpha = Math.max(0, particle.life / 0.3);
        const size = particle.size * 3.6;
        const glow = context.createRadialGradient(particle.x, particle.y, 1, particle.x, particle.y, size);
        glow.addColorStop(0, `rgba(255,246,205,${0.95 * alpha})`);
        glow.addColorStop(0.4, `rgba(255,208,120,${0.5 * alpha})`);
        glow.addColorStop(1, 'rgba(255,180,80,0)');
        context.fillStyle = glow;
        context.fillRect(particle.x - size, particle.y - size, size * 2, size * 2);
        continue;
      }
      if (particle.kind === 'spray') {
        const alpha = Math.max(0, particle.life / 0.8);
        context.strokeStyle = `rgba(205,240,252,${0.75 * alpha})`;
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(particle.x - particle.vx * 0.09, particle.y - particle.vy * 0.09);
        context.stroke();
        continue;
      }
      context.globalAlpha = Math.max(0, particle.life / 0.6);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    for (const particle of world.particles) {
      if (particle.kind !== 'smoke') continue;
      context.globalAlpha = Math.max(0, particle.life * 0.22);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.restore();
  }

  function drawRain(context, world) {
    const t = world.time;
    context.save();
    context.strokeStyle = 'rgba(175,210,240,0.24)';
    context.lineWidth = 1.1;
    context.beginPath();
    for (let index = 0; index < RAIN_COUNT; index += 1) {
      const x = (hash2(index, 21) * VIEW.width + t * 44) % VIEW.width;
      const y = (hash2(index, 22) * VIEW.height + t * 620) % VIEW.height;
      context.moveTo(x, y);
      context.lineTo(x - 3.6, y + 17);
    }
    context.stroke();
    context.strokeStyle = 'rgba(205,230,250,0.16)';
    context.beginPath();
    for (let index = 0; index < 40; index += 1) {
      const x = (hash2(index, 31) * VIEW.width + t * 90) % VIEW.width;
      const y = (hash2(index, 32) * VIEW.height + t * 900) % VIEW.height;
      context.moveTo(x, y);
      context.lineTo(x - 4.4, y + 26);
    }
    context.stroke();
    context.restore();
  }

  function drawGrade(context) {
    const vignette = context.createRadialGradient(VIEW.width / 2, VIEW.height / 2, 260, VIEW.width / 2, VIEW.height / 2, 840);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.68, 'rgba(0,0,0,0.07)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.44)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    context.fillStyle = 'rgba(20,44,74,0.04)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function draw(world, options = {}) {
    ensureLayer(world.city);
    const shake = world.camera.shake;
    const shakeX = (Math.sin(world.time * 61.7) + Math.sin(world.time * 33.1)) * shake * 0.45;
    const shakeY = (Math.cos(world.time * 53.3) + Math.sin(world.time * 27.9)) * shake * 0.4;
    const camX = Math.max(0, Math.min(CITY_SIZE.width - VIEW.width, Math.round(world.camera.x + shakeX)));
    const camY = Math.max(0, Math.min(CITY_SIZE.height - VIEW.height, Math.round(world.camera.y + shakeY)));

    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.save();
    ctx.filter = 'saturate(1.08) contrast(1.06) brightness(1.07)';
    ctx.drawImage(layer, camX, camY, VIEW.width, VIEW.height, 0, 0, VIEW.width, VIEW.height);
    ctx.restore();

    ctx.save();
    ctx.translate(-camX, -camY);
    drawSkids(ctx, world);
    drawObjective(ctx, world);
    drawHeadlights(ctx, world);
    for (const ped of world.peds) drawPed(ctx, world, ped);
    for (const cop of world.cops) drawCop(ctx, world, cop);
    drawPlayerOnFoot(ctx, world);
    for (const car of world.cars) drawCar(ctx, world, car);
    drawBullets(ctx, world);
    drawParticles(ctx, world);
    // Thugs stand out from the crowd for the player's eyes only.
    for (const thug of world.thugs) {
      if (!inView(world, thug.x, thug.y, 40)) continue;
      ctx.save();
      ctx.translate(thug.x, thug.y);
      const ring = ctx.createRadialGradient(0, 0, 2, 0, 0, 18);
      ring.addColorStop(0, 'rgba(255,80,70,0.16)');
      ring.addColorStop(1, 'rgba(255,80,70,0)');
      ctx.fillStyle = ring;
      ctx.fillRect(-18, -18, 36, 36);
      ctx.rotate(thug.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(1, 3, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      rr(ctx, -3.4, -5.4, 6.8, 10.5, 3);
      ctx.fillStyle = thug.hit > 0 ? '#ffd0b0' : '#a63a34';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,176,160,0.95)';
      ctx.lineWidth = 1.3;
      rr(ctx, -3.4, -5.4, 6.8, 10.5, 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0.6, -7.4, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#b98a6c';
      ctx.fill();
      ctx.fillStyle = '#d8dee9';
      ctx.fillRect(3, -1, 9, 2.2);
      ctx.restore();
      const health = Math.max(0, thug.health / 48);
      ctx.fillStyle = 'rgba(8,10,14,0.85)';
      ctx.fillRect(thug.x - 9, thug.y - 18, 18, 3);
      ctx.fillStyle = health > 0.4 ? PALETTE.danger : '#ffb08a';
      ctx.fillRect(thug.x - 9, thug.y - 18, 18 * health, 3);
      ctx.save();
      ctx.translate(thug.x, thug.y - 26);
      ctx.fillStyle = 'rgba(255,126,104,1)';
      ctx.shadowColor = 'rgba(255,80,60,0.95)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.lineTo(6, -4);
      ctx.lineTo(-6, -4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    drawRain(ctx, world);
    drawGrade(ctx);
    if (options.hud !== false) drawHUD(ctx, world);
  }

  return { draw, ctx, canvas };
}

const PLAYER_FIRE_GLOW = 0.12;
