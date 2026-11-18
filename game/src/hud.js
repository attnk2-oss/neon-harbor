// The HUD, drawn in screen space over the world: the health and armour bars, the wanted stars,
// money and clock, the current job and how far it is, the weapon or the car's dial, the minimap
// of the streets around Vale, and the dialogue and toast lines the story rides in on.
import { CITY_SIZE, DISTRICTS, FONT, MONO, PALETTE, PLAYER, VEHICLES, VIEW } from './config.js';

function roundRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h, alpha = 0.74) {
  roundRect(ctx, x, y, w, h, 3);
  ctx.fillStyle = `rgba(7,11,18,${alpha})`;
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function label(ctx, text, x, y, size, color, align = 'left', font = FONT) {
  ctx.font = `600 ${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

function spaced(ctx, text, x, y, size, color, gap = 3, align = 'left') {
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const chars = [...text];
  const widths = chars.map((char) => ctx.measureText(char).width + gap);
  const total = widths.reduce((sum, width) => sum + width, 0) - gap;
  let cursor = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  for (let index = 0; index < chars.length; index += 1) {
    ctx.fillText(chars[index], cursor, y);
    cursor += widths[index];
  }
  return total;
}

function formatMoney(value) {
  const rounded = Math.max(0, Math.round(value));
  return `$${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function starPath(ctx, cx, cy, radius) {
  ctx.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const r = point % 2 === 0 ? radius : radius * 0.44;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (point === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawVitals(ctx, world) {
  const player = world.player;
  panel(ctx, 18, 18, 256, 104, 0.72);
  spaced(ctx, 'VALE', 32, 42, 11, PALETTE.muted, 4);
  const barX = 32;
  const barW = 196;
  // Health
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(barX, 52, barW, 11);
  const health = Math.max(0, Math.min(1, player.health / PLAYER.maxHealth));
  ctx.fillStyle = PALETTE.health;
  ctx.fillRect(barX, 52, barW * health, 11);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(barX, 52, barW * health, 2);
  // Armour
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(barX, 68, barW, 5);
  const armour = Math.max(0, Math.min(1, player.armour / PLAYER.maxArmour));
  if (armour > 0) {
    ctx.fillStyle = PALETTE.armour;
    ctx.fillRect(barX, 68, barW * armour, 5);
  }
  label(ctx, 'HP', 258, 61, 8, PALETTE.muted, 'right');
  label(ctx, 'AR', 258, 75, 8, PALETTE.muted, 'right');
  label(ctx, formatMoney(player.money), 32, 104, 22, PALETTE.money, 'left', MONO);
  label(ctx, 'CASH', 196, 104, 9, PALETTE.muted, 'right');
}

function drawWanted(ctx, world) {
  const x = VIEW.width - 20;
  panel(ctx, VIEW.width - 252, 18, 236, 84, 0.82);
  spaced(ctx, 'WANTED', VIEW.width - 236, 44, 7.5, PALETTE.muted, 2.2, 'left');
  const pulse = 1 + (world.hudPulse || 0) * 0.25;
  for (let index = 0; index < 5; index += 1) {
    const cx = x - 18 - (4 - index) * 26;
    const cy = 44;
    starPath(ctx, cx, cy, 12 * (index < world.wanted ? pulse : 1));
    if (index < world.wanted) {
      ctx.fillStyle = world.wanted >= 4 ? PALETTE.danger : PALETTE.marker;
      ctx.shadowColor = world.wanted >= 4 ? PALETTE.danger : PALETTE.marker;
      ctx.shadowBlur = 11;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.42)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(8,13,20,0.45)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(170,190,215,0.42)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  const minutes = Math.floor(world.clock) % 1440;
  const suffix = minutes < 720 ? 'AM' : 'PM';
  const twelve = minutes % 720;
  const hour = Math.floor(twelve / 60) || 12;
  const hh = hour.toString().padStart(2, '0');
  const mm = (twelve % 60).toString().padStart(2, '0');
  label(ctx, `${hh}:${mm}`, x - 14, 76, 21, PALETTE.text, 'right', MONO);
  label(ctx, suffix, x, 76, 9, PALETTE.muted, 'right');
  label(ctx, DISTRICTS[world.district].name.toUpperCase(), x, 94, 9, DISTRICTS[world.district].accent, 'right');
}

function drawMinimap(ctx, world) {
  const x = 18;
  const y = VIEW.height - 152;
  const w = 216;
  const h = 134;
  panel(ctx, x, y, w, h, 0.78);
  const mapY = y + 20;
  const mapH = h - 26;
  ctx.save();
  roundRect(ctx, x + 6, mapY, w - 12, mapH, 2);
  ctx.clip();
  ctx.fillStyle = '#070d14';
  ctx.fillRect(x, y, w, h);

  const scale = 0.125;
  const px = world.player.x;
  const py = world.player.y;
  const innerX = x + w / 2;
  const innerY = mapY + mapH / 2;
  const toX = (wx) => innerX + (wx - px) * scale;
  const toY = (wy) => innerY + (wy - py) * scale;

  ctx.save();
  ctx.translate(innerX, innerY);
  ctx.scale(scale, scale);
  ctx.translate(-px, -py);

  // Water and quay.
  ctx.fillStyle = PALETTE.waterMid;
  ctx.fillRect(0, CITY_SIZE.waterTop, CITY_SIZE.width, CITY_SIZE.height);
  ctx.fillStyle = 'rgba(90,180,200,0.13)';
  for (let line = 0; line < 8; line += 1) {
    ctx.fillRect(120, CITY_SIZE.waterTop + 10 + line * 14, CITY_SIZE.width - 240, 1.5);
  }

  // Blocks.
  for (const block of world.city.blocks) {
    ctx.fillStyle = block.type === 'park' ? '#14261d' : '#151d29';
    ctx.fillRect(block.x, block.y, block.w, block.h);
  }

  // Roads.
  ctx.strokeStyle = '#3a4658';
  ctx.lineWidth = 26;
  for (let i = 0; i <= 8; i += 1) {
    const nx = CITY_SIZE.node(i);
    ctx.beginPath();
    ctx.moveTo(nx, 0);
    ctx.lineTo(nx, CITY_SIZE.waterTop);
    ctx.stroke();
  }
  for (let j = 0; j <= 8; j += 1) {
    const ny = CITY_SIZE.node(j);
    ctx.beginPath();
    ctx.moveTo(0, ny);
    ctx.lineTo(CITY_SIZE.width, ny);
    ctx.stroke();
  }

  // Buildings in a darker ink so the map reads as streets.
  ctx.fillStyle = 'rgba(3,6,10,0.55)';
  for (const building of world.city.buildings) {
    ctx.fillRect(building.x, building.y, building.w, building.h);
  }
  ctx.restore();

  // Police, drawn at a readable size whatever the map scale.
  for (const car of world.cars) {
    if (car.driver !== 'police') continue;
    ctx.fillStyle = PALETTE.sirenRed;
    ctx.beginPath();
    ctx.arc(toX(car.x), toY(car.y), 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cop of world.cops) {
    if (cop.state === 'down') continue;
    ctx.fillStyle = PALETTE.sirenRed;
    ctx.beginPath();
    ctx.arc(toX(cop.x), toY(cop.y), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Objective diamond.
  if (world.objective) {
    const pulse = 1 + Math.sin(world.time * 3.4) * 0.16;
    const ox = toX(world.objective.x);
    const oy = toY(world.objective.y);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.marker;
    ctx.fillRect(-4.2 * pulse, -4.2 * pulse, 8.4 * pulse, 8.4 * pulse);
    ctx.strokeStyle = 'rgba(255,209,92,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-7, -7, 14, 14);
    ctx.restore();
  }

  // The player, always at the map's centre.
  ctx.save();
  ctx.translate(innerX, innerY);
  const facing = world.player.onFoot ? world.player.angle : world.player.car.angle;
  ctx.rotate(facing + Math.PI / 2);
  ctx.fillStyle = '#a8fff2';
  ctx.strokeStyle = 'rgba(8,16,24,0.9)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -6.5);
  ctx.lineTo(5, 5);
  ctx.lineTo(0, 2.6);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
  ctx.save();
  roundRect(ctx, x + 6, mapY, w - 12, mapH, 2);
  ctx.strokeStyle = 'rgba(120,160,200,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  label(ctx, 'PORT KESSEL', x + 10, y + 15, 9, PALETTE.muted);
  label(ctx, 'N', x + w - 15, y + 15, 10, PALETTE.text, 'center');
}

function drawObjective(ctx, world) {
  if (!world.objective) return;
  const objective = world.objective;
  const distance = Math.round(Math.hypot(objective.x - world.player.x, objective.y - world.player.y) / 10);
  const width = 400;
  const x = VIEW.width / 2 - width / 2;
  const y = 18;
  panel(ctx, x, y, width, 56, 0.72);
  ctx.fillStyle = PALETTE.marker;
  ctx.fillRect(x, y, 3, 56);
  label(ctx, objective.title || 'JOB', x + 16, y + 17, 9, PALETTE.marker);
  label(ctx, objective.label, x + 16, y + 38, 15, PALETTE.text);
  label(ctx, `${distance} m`, x + width - 16, y + 38, 12, PALETTE.muted, 'right', MONO);
  if (objective.kind === 'clear' && world.thugs.length > 0) {
    label(ctx, `${world.thugs.length} HOSTILES LEFT`, x + width - 16, y + 52, 9, PALETTE.danger, 'right');
  }
}

function drawWeapon(ctx, world) {
  const player = world.player;
  const x = VIEW.width - 20;
  const y = VIEW.height - 112;
  panel(ctx, x - 238, y, 238, 94, 0.74);
  if (!player.onFoot && player.car) {
    const car = player.car;
    const speed = Math.round(Math.hypot(car.vx, car.vy) / 10) * 3;
    label(ctx, VEHICLES[car.kind].name.toUpperCase(), x - 16, y + 20, 10, PALETTE.muted, 'right');
    label(ctx, String(speed), x - 40, y + 62, 40, PALETTE.text, 'right', MONO);
    label(ctx, 'KM/H', x - 16, y + 62, 10, PALETTE.muted, 'right');
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x - 220, y + 74, 204, 5);
    ctx.fillStyle = car.wrecked ? PALETTE.danger : PALETTE.armour;
    ctx.fillRect(x - 220, y + 74, 204 * Math.max(0, car.health / car.maxHealth), 5);
  } else {
    const weapon = player.weapon === 'pistol' ? 'PISTOL' : 'FISTS';
    label(ctx, 'WEAPON', x - 16, y + 18, 9, PALETTE.muted, 'right');
    label(ctx, weapon, x - 16, y + 42, 18, PALETTE.weapon, 'right');
    if (player.weapon === 'pistol') {
      label(ctx, String(player.ammo).padStart(2, '0'), x - 16, y + 80, 26, PALETTE.text, 'right', MONO);
      label(ctx, 'ROUNDS', x - 74, y + 80, 9, PALETTE.muted, 'right');
    } else {
      label(ctx, 'Q  SWITCH', x - 16, y + 80, 9, PALETTE.muted, 'right');
    }
  }
}

function drawDialogue(ctx, world) {
  if (!world.dialogue) return;
  const dialogue = world.dialogue;
  const alpha = Math.min(1, dialogue.timer * 2);
  const width = 680;
  const x = VIEW.width / 2 - width / 2;
  const y = VIEW.height - 128;
  ctx.globalAlpha = alpha;
  panel(ctx, x, y, width, 84, 0.82);
  ctx.fillStyle = PALETTE.marker;
  ctx.fillRect(x, y, 3, 84);
  label(ctx, dialogue.speaker, x + 18, y + 22, 10, PALETTE.marker);
  ctx.font = `500 15px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const words = dialogue.text.split(' ');
  let line = '';
  let lineY = y + 46;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > width - 36 && line) {
      ctx.fillText(line, x + 18, lineY);
      line = word;
      lineY += 20;
    } else line = test;
  }
  if (line) ctx.fillText(line, x + 18, lineY);
  ctx.globalAlpha = 1;
}

function drawToast(ctx, world) {
  if (!world.toast) return;
  const toast = world.toast;
  const alpha = Math.min(1, toast.timer * 3);
  ctx.globalAlpha = alpha;
  ctx.font = `600 12px ${FONT}`;
  const width = ctx.measureText(toast.text).width + 34;
  const x = VIEW.width / 2 - width / 2;
  const y = 92;
  panel(ctx, x, y, width, 30, 0.7);
  label(ctx, toast.text, VIEW.width / 2, y + 20, 12, toast.color || PALETTE.text, 'center');
  ctx.globalAlpha = 1;
}

function drawPrompt(ctx, world) {
  const player = world.player;
  if (player.dead) return;
  if (player.onFoot) {
    const car = world.nearbyCar ? world.nearbyCar() : null;
    if (!car) return;
    const spec = VEHICLES[car.kind];
    const text = `F   ${car.driver ? 'TAKE' : 'DRIVE'} THE ${spec.name.toUpperCase()}`;
    ctx.font = `600 11px ${FONT}`;
    const width = ctx.measureText(text).width + 28;
    const x = VIEW.width / 2 - width / 2;
    const y = VIEW.height - 44;
    panel(ctx, x, y, width, 28, 0.7);
    label(ctx, text, VIEW.width / 2, y + 18, 11, PALETTE.text, 'center');
  }
}

export function drawHUD(ctx, world) {
  drawVitals(ctx, world);
  drawWanted(ctx, world);
  drawObjective(ctx, world);
  drawMinimap(ctx, world);
  drawWeapon(ctx, world);
  drawPrompt(ctx, world);
  drawToast(ctx, world);
  drawDialogue(ctx, world);

  const player = world.player;
  if (player.hurt > 0) {
    const alpha = Math.min(0.4, player.hurt * 0.8);
    const gradient = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, 260, VIEW.width / 2, VIEW.height / 2, 760);
    gradient.addColorStop(0, 'rgba(255,40,50,0)');
    gradient.addColorStop(1, `rgba(255,30,44,${alpha})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  if (player.dead) {
    ctx.fillStyle = 'rgba(3,5,9,0.5)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    spaced(ctx, 'VALE IS DOWN', VIEW.width / 2, VIEW.height / 2 - 6, 34, PALETTE.danger, 6, 'center');
    label(ctx, "The harbour isn't finished with you yet.", VIEW.width / 2, VIEW.height / 2 + 28, 14, PALETTE.muted, 'center');
  }
}

export { formatMoney, panel, label, spaced, roundRect };
