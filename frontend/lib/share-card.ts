import { SYMBOL_PATH, WORDMARK_PATH, ZUG } from "@/components/brand/ZugLogo";
import type { ApiOutcome } from "@/lib/api";

/**
 * Share cards: 1200×675 PNGs (X's large-card ratio) drawn on a canvas with
 * the site's own fonts, so the preview and the downloaded file are the same
 * image. Brand rules hold here too: graphite, bone, one vermilion accent,
 * square geometry, the knight's leap.
 */

const W = 1200;
const H = 675;
const PAD = 56;
const SCALE = 2;

const INK = {
  graphite: ZUG.graphite,
  bone: ZUG.bone,
  vermilion: ZUG.vermilion,
  ledger: ZUG.ledger,
  card: "#16181B",
  raised: "#1F2226",
  border: "#2C3036",
  muted: "#8A9099",
  dim: "#5F656E",
  success: "#5FB98A",
  destructive: "#E5484D",
  boardLight: "#E4DFD4",
  boardDark: "#5F656E",
} as const;

type Face = "display" | "body" | "mono";
type Ctx = CanvasRenderingContext2D;

let families: Record<Face, string> | null = null;

function family(face: Face): string {
  if (!families) {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    families = {
      display: read("--font-archivo", "sans-serif"),
      body: read("--font-geist", "sans-serif"),
      mono: read("--font-jetbrains", "monospace"),
    };
  }
  return families[face];
}

function font(ctx: Ctx, face: Face, size: number, weight = 400, tracking = 0) {
  ctx.font = `${weight} ${size}px ${family(face)}`;
  // Archivo is set wide, as in the wordmark. Browsers without these keep defaults.
  ctx.fontStretch = face === "display" ? "expanded" : "normal";
  ctx.letterSpacing = `${tracking}px`;
}

/** Largest size (≤ max) at which `text` fits in `width`. Leaves the font set. */
function fit(ctx: Ctx, text: string, width: number, face: Face, max: number, weight: number) {
  let size = max;
  font(ctx, face, size, weight);
  while (size > 12 && ctx.measureText(text).width > width) {
    size -= 2;
    font(ctx, face, size, weight);
  }
  return size;
}

function text(ctx: Ctx, value: string, x: number, y: number, color: string, align: CanvasTextAlign = "left") {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
  return ctx.measureText(value).width;
}

function label(ctx: Ctx, value: string, x: number, y: number, color: string = INK.muted, align: CanvasTextAlign = "left") {
  font(ctx, "mono", 13, 500, 2.2);
  return text(ctx, value.toUpperCase(), x, y, color, align);
}

function hairline(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string = INK.border) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function symbol(ctx: Ctx, x: number, y: number, size: number, ink: string, accent: string = INK.vermilion) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 48, size / 48);
  ctx.fillStyle = ink;
  ctx.fill(new Path2D(SYMBOL_PATH), "evenodd");
  ctx.fillStyle = accent;
  ctx.fillRect(38, 0, 8, 8);
  ctx.restore();
}

/** A boxed mono tag, right-aligned to `right`. */
function tag(ctx: Ctx, value: string, right: number, y: number, color: string, filled = false) {
  font(ctx, "mono", 13, 700, 2.2);
  const width = ctx.measureText(value).width + 24;
  if (filled) {
    ctx.fillStyle = color;
    ctx.fillRect(right - width, y - 22, width, 32);
  } else {
    ctx.strokeStyle = color;
    ctx.strokeRect(right - width + 0.5, y - 21.5, width - 1, 31);
  }
  text(ctx, value, right - width / 2, y, filled ? INK.graphite : color, "center");
}

/** Logo lockup, tag, hairline frame and the footer every card shares. */
function frame(ctx: Ctx, tagText: string, footerProgress?: number) {
  ctx.fillStyle = INK.graphite;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = INK.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(24.5, 24.5, W - 49, H - 49);

  symbol(ctx, PAD, 48, 40, INK.bone);
  ctx.save();
  ctx.translate(PAD + 54, 62);
  ctx.scale(0.22, 0.22);
  ctx.fillStyle = INK.bone;
  ctx.fill(new Path2D(WORDMARK_PATH));
  ctx.fillStyle = INK.vermilion;
  ctx.fillRect(306, 78, 22, 22);
  ctx.restore();
  font(ctx, "display", 21, 400, 1);
  text(ctx, "ARENA", PAD + 138, 84, INK.bone);

  tag(ctx, tagText, W - PAD, 78, INK.vermilion);

  const footer = H - 82;
  hairline(ctx, PAD, footer, W - PAD, footer);
  if (footerProgress !== undefined) {
    ctx.fillStyle = INK.vermilion;
    ctx.fillRect(PAD, footer - 1, (W - PAD * 2) * Math.max(0, Math.min(1, footerProgress)), 3);
  }
  font(ctx, "mono", 15, 500, 1);
  text(ctx, window.location.host, PAD, H - 46, INK.muted);
  text(ctx, "EVERY MOVE MATTERS.", W - PAD, H - 46, INK.bone, "right");
}

/**
 * The knight's leap on a board fragment: knight on (file, rank), vermilion
 * landing square two up and one across, joined by a dashed L.
 */
function leap(
  ctx: Ctx,
  x: number,
  y: number,
  square: number,
  files: number,
  ranks: number,
  from: [number, number],
  colors: { light: string; dark: string; knight: string; path: string }
) {
  for (let r = 0; r < ranks; r++) {
    for (let f = 0; f < files; f++) {
      ctx.fillStyle = (r + f) % 2 === 0 ? colors.light : colors.dark;
      ctx.fillRect(x + f * square, y + r * square, square, square);
    }
  }
  const [ff, fr] = from;
  const to: [number, number] = [ff - 1, fr - 2];
  const centre = ([f, r]: [number, number]) => [x + f * square + square / 2, y + r * square + square / 2];
  ctx.fillStyle = INK.vermilion;
  ctx.fillRect(x + to[0] * square, y + to[1] * square, square, square);

  const [sx, sy] = centre(from);
  const [ex, ey] = centre(to);
  ctx.save();
  ctx.strokeStyle = colors.path;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.moveTo(sx, sy - square * 0.3);
  ctx.lineTo(sx, ey);
  ctx.lineTo(ex + square * 0.3, ey);
  ctx.stroke();
  ctx.restore();

  const glyph = square * 0.72;
  symbol(ctx, sx - glyph / 2, sy - glyph / 2, glyph, colors.knight, colors.knight);
}

function cells(ctx: Ctx, top: number, left: number, width: number, items: Array<{ label: string; value: string; color?: string }>) {
  const cell = width / items.length;
  hairline(ctx, left, top, left + width, top);
  items.forEach((item, index) => {
    const x = left + index * cell;
    if (index > 0) hairline(ctx, x, top, x, top + 96);
    const inset = index > 0 ? 20 : 0;
    label(ctx, item.label, x + inset, top + 32);
    fit(ctx, item.value, cell - inset - 16, "mono", 32, 700);
    text(ctx, item.value, x + inset, top + 78, item.color ?? INK.bone);
  });
}

// ── Cards ──────────────────────────────────────────────────────────────────

export interface PnlCard {
  name: string;
  symbol: string;
  net: string;
  positive: boolean;
  roi: string;
  wagered: string;
  returned: string;
  record: string;
  games: number;
}

export function drawPnlCard(ctx: Ctx, card: PnlCard) {
  frame(ctx, "P&L REPORT");

  // The leap climbs when the ledger is up and falls when it's down.
  const square = 66;
  const bx = W - PAD - square * 5;
  const by = 128;
  ctx.save();
  if (!card.positive) {
    ctx.translate(bx + square * 2.5, by + square * 3);
    ctx.scale(1, -1);
    ctx.translate(-(bx + square * 2.5), -(by + square * 3));
  }
  leap(ctx, bx, by, square, 5, 6, [3, 4], {
    light: INK.raised,
    dark: INK.card,
    knight: INK.bone,
    path: INK.bone,
  });
  ctx.restore();
  // Fade the board into the ledger on its left edge.
  const fade = ctx.createLinearGradient(bx - 40, 0, bx + square * 2, 0);
  fade.addColorStop(0, INK.graphite);
  fade.addColorStop(1, "rgba(13,14,16,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(bx - 40, by, square * 2 + 40, square * 6);

  fit(ctx, card.name, 640, "display", 30, 800);
  text(ctx, card.name, PAD, 160, INK.bone);
  label(ctx, `Net P&L · ${card.games} ${card.games === 1 ? "game" : "games"}`, PAD, 196);

  const figure = `${card.positive ? "+" : "−"}${card.net}`;
  const size = fit(ctx, figure, 560, "display", 150, 900);
  const figureWidth = text(ctx, figure, PAD - 4, 330, card.positive ? INK.vermilion : INK.bone);
  font(ctx, "mono", Math.max(20, size * 0.2), 700, 1);
  text(ctx, card.symbol, PAD + figureWidth + 12, 330, INK.muted);

  font(ctx, "mono", 17, 700, 1);
  const roi = `${card.roi} ROI`;
  const roiWidth = ctx.measureText(roi).width + 24;
  ctx.fillStyle = card.positive ? INK.vermilion : INK.raised;
  ctx.fillRect(PAD, 360, roiWidth, 34);
  text(ctx, roi, PAD + 12, 383, card.positive ? INK.graphite : INK.bone);
  font(ctx, "body", 18, 400);
  text(
    ctx,
    card.positive ? "Every move on-chain. Every coin earned." : "Down, not out. The next game is one move away.",
    PAD + roiWidth + 16,
    384,
    INK.muted
  );

  cells(ctx, 440, PAD, 620, [
    { label: "Wagered", value: `${card.wagered}` },
    { label: "Returned", value: `${card.returned}`, color: INK.success },
    { label: "W · L · D", value: card.record },
  ]);
}

export interface ProfileCard {
  name: string;
  wallet: string;
  rating: number;
  provisional: boolean;
  rank: number | null;
  peak: number;
  level: { level: number; tier: string; xp: number; progress: number } | null;
  games: number;
  wins: number;
  winRate: number;
  bestStreak: number;
  history: number[];
  form: ApiOutcome[];
}

export function drawProfileCard(ctx: Ctx, card: ProfileCard) {
  frame(ctx, "PLAYER CARD", card.level?.progress);

  fit(ctx, card.name, 600, "display", 54, 900);
  text(ctx, card.name, PAD, 172, INK.bone);
  font(ctx, "mono", 15, 500, 1);
  const short = `${card.wallet.slice(0, 4)}…${card.wallet.slice(-4)}`;
  const walletWidth = text(ctx, short, PAD, 206, INK.muted);
  if (card.level) {
    font(ctx, "mono", 15, 700, 2);
    text(ctx, `LV ${card.level.level} · ${card.level.tier.toUpperCase()}`, PAD + walletWidth + 18, 206, INK.vermilion);
  }

  label(ctx, card.provisional ? "Rating · provisional" : "Rating", PAD, 256);
  font(ctx, "display", 128, 900, -2);
  const ratingWidth = text(ctx, String(card.rating), PAD - 4, 374, INK.bone);
  if (card.rank) {
    // The rank sits on its own vermilion square, like the landing square.
    const x = PAD + ratingWidth + 22;
    ctx.fillStyle = INK.vermilion;
    ctx.fillRect(x, 270, 104, 104);
    fit(ctx, `#${card.rank}`, 84, "display", 44, 900);
    text(ctx, `#${card.rank}`, x + 52, 334, INK.graphite, "center");
    font(ctx, "mono", 11, 700, 2);
    text(ctx, "LADDER", x + 52, 360, INK.graphite, "center");
  }

  // Rating curve on the right.
  const chart = { x: 700, y: 140, w: W - PAD - 700, h: 200 };
  const points = card.history.length > 1 ? card.history : [card.rating, card.rating];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(max - min, 40);
  const low = (min + max) / 2 - span / 2;
  const px = (i: number) => chart.x + (i / (points.length - 1)) * chart.w;
  const py = (r: number) => chart.y + chart.h - ((r - low) / span) * chart.h;
  for (let i = 1; i < 4; i++) hairline(ctx, chart.x, chart.y + (chart.h / 4) * i, chart.x + chart.w, chart.y + (chart.h / 4) * i, INK.card);
  const area = ctx.createLinearGradient(0, chart.y, 0, chart.y + chart.h);
  area.addColorStop(0, "rgba(255,79,26,0.32)");
  area.addColorStop(1, "rgba(255,79,26,0)");
  ctx.beginPath();
  ctx.moveTo(px(0), chart.y + chart.h);
  points.forEach((r, i) => ctx.lineTo(px(i), py(r)));
  ctx.lineTo(px(points.length - 1), chart.y + chart.h);
  ctx.closePath();
  ctx.fillStyle = area;
  ctx.fill();
  ctx.beginPath();
  points.forEach((r, i) => (i === 0 ? ctx.moveTo(px(i), py(r)) : ctx.lineTo(px(i), py(r))));
  ctx.strokeStyle = INK.vermilion;
  ctx.lineWidth = 3;
  ctx.lineJoin = "miter";
  ctx.stroke();
  const last = points.length - 1;
  ctx.fillStyle = INK.bone;
  ctx.fillRect(px(last) - 6, py(points[last]) - 6, 12, 12);
  label(ctx, `Peak ${card.peak}`, chart.x + chart.w, chart.y - 14, INK.muted, "right");

  // Recent form as squares under the curve.
  if (card.form.length > 0) {
    label(ctx, "Form", chart.x, 386);
    card.form.slice(0, 8).forEach((result, i) => {
      const x = chart.x + 70 + i * 34;
      ctx.fillStyle = result === "win" ? INK.success : result === "loss" ? INK.destructive : INK.ledger;
      ctx.fillRect(x, 366, 28, 28);
      font(ctx, "mono", 14, 700);
      text(ctx, result === "win" ? "W" : result === "loss" ? "L" : "D", x + 14, 386, INK.graphite, "center");
    });
  }

  cells(ctx, 426, PAD, W - PAD * 2, [
    { label: "Games", value: card.games.toLocaleString() },
    { label: "Wins", value: card.wins.toLocaleString(), color: INK.success },
    { label: "Win rate", value: `${Math.round(card.winRate * 100)}%` },
    { label: "Best streak", value: String(card.bestStreak), color: INK.vermilion },
    { label: "XP", value: card.level ? card.level.xp.toLocaleString() : "—" },
  ]);
}

export interface InviteCard {
  name: string;
  rating: number | null;
  matchId: string;
  stake: string;
  clock: string;
}

export function drawInviteCard(ctx: Ctx, card: InviteCard) {
  frame(ctx, `MATCH #${card.matchId}`);

  // The in-app board with the leap g1–f3 played: it's black's turn to answer.
  const square = 54;
  const bx = W - PAD - square * 8;
  const by = 118;
  leap(ctx, bx, by, square, 8, 8, [6, 7], {
    light: INK.boardLight,
    dark: INK.boardDark,
    knight: INK.bone,
    path: INK.graphite,
  });
  font(ctx, "mono", 11, 500);
  "abcdefgh".split("").forEach((file, i) => {
    text(ctx, file, bx + i * square + square - 4, by + square * 8 - 5, i % 2 === 0 ? INK.boardLight : INK.boardDark, "right");
  });

  label(ctx, "Open challenge", PAD, 146, INK.vermilion);
  const headWidth = bx - PAD - 40;
  const size = fit(ctx, "MOVE", headWidth - 40, "display", 120, 900);
  const first = 146 + size * 0.95;
  const second = first + size * 0.88;
  text(ctx, "YOUR", PAD - 4, first, INK.bone);
  const moveWidth = text(ctx, "MOVE", PAD - 4, second, INK.bone);
  ctx.fillStyle = INK.vermilion;
  ctx.fillRect(PAD + moveWidth + 2, second - size * 0.2, size * 0.2, size * 0.2);

  fit(ctx, `${card.name} (0000) is waiting for you.`, headWidth, "body", 22, 500);
  const nameWidth = text(ctx, card.name, PAD, second + 44, INK.bone);
  ctx.font = ctx.font.replace(/^500/, "400");
  text(ctx, card.rating ? ` (${card.rating}) is waiting for you.` : " is waiting for you.", PAD + nameWidth, second + 44, INK.muted);

  cells(ctx, 444, PAD, headWidth, [
    { label: "Stake", value: card.stake, color: card.stake === "FREE" ? INK.bone : INK.vermilion },
    { label: "Clock", value: card.clock },
    { label: "You play", value: "Black" },
  ]);
}

// ── Rendering and links ────────────────────────────────────────────────────

export async function renderCard(draw: (ctx: Ctx) => void): Promise<Blob> {
  await Promise.all([
    document.fonts.load(`900 100px ${family("display")}`),
    document.fonts.load(`400 20px ${family("display")}`),
    document.fonts.load(`400 20px ${family("body")}`),
    document.fonts.load(`700 20px ${family("mono")}`),
  ]).catch(() => undefined);
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";
  draw(ctx);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't draw the card."))), "image/png")
  );
}

/** Token amount for display: at most `places` decimals, trailing zeros dropped. */
export function compactAmount(amount: string, places = 3): string {
  const [whole, fraction = ""] = amount.split(".");
  const trimmed = fraction.slice(0, places).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export type ShareChannel = "x" | "whatsapp" | "telegram";

export function shareLink(channel: ShareChannel, message: string, url: string): string {
  const enc = encodeURIComponent;
  switch (channel) {
    case "x":
      return `https://x.com/intent/post?text=${enc(message)}&url=${enc(url)}`;
    case "whatsapp":
      return `https://wa.me/?text=${enc(`${message} ${url}`)}`;
    case "telegram":
      return `https://t.me/share/url?url=${enc(url)}&text=${enc(message)}`;
  }
}
