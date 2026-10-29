// Marble Park room-code server.
// Serves the game page and relays live race state between the players in a room.
// Each device simulates its own marble; the server owns rooms, the race clock, the shortcut gate and results.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const GAME_FILE = path.join(__dirname, "..", "game", "grand-entrance.html");
const MAX_PLAYERS = 8;
const COUNTDOWN_MS = 3500;
const GATE_MS = 8000;
// in play order; a park tour plays them all, each player clicking Ready between courses
const COURSES = [{ id: "entrance", seconds: 75 }, { id: "bumper", seconds: 95 }, { id: "skate", seconds: 90 }, { id: "lagoon", seconds: 75 }, { id: "bigtop", seconds: 100 }, { id: "clouds", seconds: 100 }, { id: "beach", seconds: 115 }, { id: "pier", seconds: 140 }];
const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O, so codes are easy to read aloud
const MARBLE_IDS = ["sky", "ember", "clover", "midnight", "lagoon", "violet", "sunflower", "peppermint"];

const rooms = new Map();
let nextId = 1;

// ---------- HTTP: the game page and a health check used to wake the server ----------
function gamePage() {
  const body = fs.readFileSync(GAME_FILE, "utf8");
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + body + "</body></html>";
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    try {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      res.end(gamePage());
    } catch (e) { res.writeHead(500); res.end("Game file missing"); }
    return;
  }
  res.writeHead(404); res.end("Not found");
});

// ---------- WebSocket: rooms ----------
const wss = new WebSocketServer({ server, maxPayload: 4096 });

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room, msg, exceptId) { const s = JSON.stringify(msg); for (const p of room.players.values()) if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(s); }
function cleanName(n) { return String(n || "").replace(/[^\p{L}\p{N} _'.-]/gu, "").trim().slice(0, 12) || "Player"; }
function newCode() { for (;;) { let c = ""; for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; if (!rooms.has(c)) return c; } }
function freeMarble(room, wanted) {
  const taken = new Set([...room.players.values()].map(p => p.marble));
  if (MARBLE_IDS.includes(wanted) && !taken.has(wanted)) return wanted;
  return MARBLE_IDS.find(m => !taken.has(m));
}
const racesIn = room => room.mode === "tour" ? COURSES.length : 1;
function roomState(room) {
  return {
    t: "room", code: room.code, host: room.host, mode: room.mode, course: room.course, phase: room.phase, race: room.race,
    races: racesIn(room), ready: [...room.ready],
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, marble: p.marble, total: room.totals[p.id] || 0 })),
  };
}
// between tour courses: once everyone still here has clicked Ready, the next course starts
function checkReady(room) {
  if (room.phase !== "results" || room.race >= racesIn(room) || room.players.size === 0) return;
  if ([...room.players.keys()].every(id => room.ready.has(id))) startRace(room);
}

function addPlayer(ws, room, name, marble) {
  const p = { id: ws.id, ws, name: cleanName(name), marble: freeMarble(room, marble), prog: 0, finish: null };
  room.players.set(p.id, p);
  ws.room = room;
  send(ws, { t: "joined", code: room.code, you: p.id, serverTime: Date.now() });
  broadcast(room, roomState(room));
}

function leave(ws) {
  const room = ws.room; if (!room) return;
  ws.room = null;
  room.players.delete(ws.id);
  if (room.players.size === 0) { clearTimeout(room.timer); rooms.delete(room.code); return; }
  if (room.host === ws.id) room.host = room.players.keys().next().value;
  room.ready.delete(ws.id);
  broadcast(room, roomState(room));
  if (room.phase === "race" && [...room.players.values()].every(p => p.finish)) endRace(room);
  checkReady(room);
}

function startRace(room) {
  const course = room.mode === "tour" ? COURSES[room.race] : COURSES.find(c => c.id === room.course) || COURSES[0];
  room.phase = "race"; room.race += 1; room.startAt = Date.now() + COUNTDOWN_MS; room.gateUntil = 0; room.ready = new Set();
  const slots = {}; let i = 0;
  for (const p of room.players.values()) { p.finish = null; p.prog = 0; slots[p.id] = i++; }
  broadcast(room, roomState(room));
  broadcast(room, { t: "start", race: room.race, races: racesIn(room), course: course.id, startAt: room.startAt, raceSeconds: course.seconds, slots });
  clearTimeout(room.timer);
  room.timer = setTimeout(() => endRace(room), COUNTDOWN_MS + course.seconds * 1000 + 2000);
}

function endRace(room) {
  if (room.phase !== "race") return;
  clearTimeout(room.timer);
  const ps = [...room.players.values()];
  const done = ps.filter(p => p.finish).sort((a, b) => a.finish.time - b.finish.time);
  const dnf = ps.filter(p => !p.finish).sort((a, b) => b.prog - a.prog);
  const standings = [...done, ...dnf].map((p, i) => {
    const points = p.finish ? POINTS[i] || 0 : 0;
    room.totals[p.id] = (room.totals[p.id] || 0) + points;
    return { id: p.id, name: p.name, marble: p.marble, time: p.finish ? p.finish.time : null, falls: p.finish ? p.finish.falls : null, points, total: room.totals[p.id] };
  });
  const races = racesIn(room);
  room.phase = "results"; room.ready = new Set();
  broadcast(room, { t: "results", race: room.race, races, mode: room.mode, final: room.race >= races, next: room.race < races ? COURSES[room.race].id : null, standings });
  broadcast(room, roomState(room));
}

function num(v, lo, hi) { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; }

function handle(ws, m) {
  const room = ws.room, me = room && room.players.get(ws.id), isHost = room && room.host === ws.id;
  switch (m.t) {
    case "ping": send(ws, { t: "pong", c: m.c, s: Date.now() }); break;
    case "create": {
      if (room) leave(ws);
      const r = { code: newCode(), host: ws.id, players: new Map(), mode: "tour", course: COURSES[0].id, phase: "lobby", race: 0, totals: {}, ready: new Set(), gateUntil: 0, timer: null };
      rooms.set(r.code, r);
      addPlayer(ws, r, m.name, m.marble);
      break;
    }
    case "join": {
      const code = String(m.code || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
      const r = rooms.get(code);
      if (!r) return send(ws, { t: "error", msg: `No room with code ${code || "(blank)"}. Check the code and try again.` });
      if (r.players.size >= MAX_PLAYERS) return send(ws, { t: "error", msg: "That room is full (8 players)." });
      if (r.phase === "race") return send(ws, { t: "error", msg: "That room is mid-race. Try again when the race ends." });
      if (room) leave(ws);
      addPlayer(ws, r, m.name, m.marble);
      break;
    }
    case "leave": leave(ws); break;
    case "pick":
      if (room && room.phase !== "race" && me) { const mb = freeMarble(room, m.marble); if (mb === m.marble) { me.marble = mb; broadcast(room, roomState(room)); } }
      break;
    case "mode":
      if (isHost && room.phase === "lobby" && (m.mode === "quick" || m.mode === "tour")) { room.mode = m.mode; broadcast(room, roomState(room)); }
      break;
    case "course":
      if (isHost && room.phase === "lobby" && COURSES.some(c => c.id === m.course)) { room.course = m.course; broadcast(room, roomState(room)); }
      break;
    case "start":
      if (isHost && room.phase === "lobby") { room.race = 0; room.totals = {}; startRace(room); }
      break;
    case "ready":
      if (room && room.phase === "results" && me) { room.ready.add(ws.id); broadcast(room, roomState(room)); checkReady(room); }
      break;
    case "lobby":
      if (isHost && room.phase === "results") { room.phase = "lobby"; room.race = 0; room.totals = {}; room.ready = new Set(); broadcast(room, roomState(room)); }
      break;
    case "st": // live position: [x, y, z, vx, vy, vz, state, progress, scale]
      if (room && room.phase === "race" && Array.isArray(m.d) && m.d.length <= 10) {
        me.prog = num(m.d[7], 0, 1e4);
        broadcast(room, { t: "st", id: ws.id, d: m.d.map(v => typeof v === "number" ? Math.round(v * 100) / 100 : String(v).slice(0, 2)) }, ws.id);
      }
      break;
    case "gate":
      if (room && room.phase === "race") { room.gateUntil = Date.now() + GATE_MS; broadcast(room, { t: "gate", until: room.gateUntil, by: ws.id, g: String(m.g || "").slice(0, 24) }); }
      break;
    case "finish":
      if (room && room.phase === "race" && me && !me.finish && Date.now() >= room.startAt) {
        // the server's clock decides the time; the client only reports puddle penalties
        const time = (Date.now() - room.startAt) / 1000 + num(m.penalty, 0, 60);
        me.finish = { time: Math.round(time * 10) / 10, falls: num(m.falls, 0, 999) };
        broadcast(room, { t: "fin", id: ws.id, time: me.finish.time });
        if ([...room.players.values()].every(p => p.finish)) { clearTimeout(room.timer); room.timer = setTimeout(() => endRace(room), 1500); }
      }
      break;
  }
}

wss.on("connection", ws => {
  ws.id = "p" + nextId++;
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", raw => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m && typeof m.t === "string") handle(ws, m); });
  ws.on("close", () => leave(ws));
});

// drop connections that stopped answering (closed laptop, lost signal); behind a hosting proxy a
// closed tab can go unnoticed for a while, so check often
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); leave(ws); continue; } ws.isAlive = false; ws.ping(); } }, 10000);

// On Render the server must accept outside connections; on a personal computer it only listens to that computer itself.
const HOST = process.env.RENDER ? "0.0.0.0" : "127.0.0.1";
server.listen(PORT, HOST, () => console.log(`Marble Park server on http://localhost:${PORT}`));
