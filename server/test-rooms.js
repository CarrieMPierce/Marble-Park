// Smoke test for the room-code server: three players create/join a room, race, and get results.
// Usage: node server/test-rooms.js [ws://localhost:3000]
"use strict";
const WebSocket = require("ws");
const URL = process.argv[2] || "ws://localhost:3000";
const wait = ms => new Promise(r => setTimeout(r, ms));
const checks = [];
const check = (ok, what) => { checks.push([ok, what]); console.log((ok ? "PASS " : "FAIL ") + what); };

function client(name) {
  const ws = new WebSocket(URL), c = { name, ws, got: [], id: null };
  ws.on("message", raw => { const m = JSON.parse(raw); c.got.push(m); if (m.t === "joined") c.id = m.you; });
  c.ready = new Promise(r => ws.on("open", r));
  c.send = o => ws.send(JSON.stringify(o));
  c.last = t => [...c.got].reverse().find(m => m.t === t);
  return c;
}

(async () => {
  const a = client("Ana"), b = client("Ben"), c = client("Cy");
  await Promise.all([a.ready, b.ready, c.ready]);
  a.send({ t: "create", name: "Ana", marble: "sky" }); await wait(200);
  const code = a.last("joined") && a.last("joined").code;
  check(/^[A-HJ-NP-Z]{4}$/.test(code || ""), `room created with code ${code}`);
  b.send({ t: "join", code: code.toLowerCase(), name: "Ben<script>", marble: "sky" });
  c.send({ t: "join", code: "ZZZZ", name: "Cy" }); await wait(200);
  check(c.last("error") && /No room/.test(c.last("error").msg), "wrong code gives a clear error");
  c.send({ t: "join", code, name: "Cy", marble: "ember" }); await wait(200);
  const room = a.last("room");
  check(room.players.length === 3, "three players in the lobby");
  check(new Set(room.players.map(p => p.marble)).size === 3, "marbles are unique (Ben's taken pick was reassigned)");
  check(room.players.every(p => !/[<>]/.test(p.name)), "names are cleaned of HTML characters");
  b.send({ t: "start" }); await wait(100);
  check(!b.last("start"), "only the host can start");
  a.send({ t: "mode", mode: "tournament" }); await wait(100);
  check(a.last("room").mode === "tournament", "host switched to tournament");
  a.send({ t: "start" }); await wait(200);
  const st = c.last("start");
  check(st && st.race === 1 && st.races === 3 && Object.keys(st.slots).length === 3, "race 1 of 3 started for everyone");
  const joinMid = client("Late"); await joinMid.ready; joinMid.send({ t: "join", code, name: "Late" }); await wait(150);
  check(joinMid.last("error") && /mid-race/.test(joinMid.last("error").msg), "can't join mid-race");
  joinMid.ws.close();
  a.send({ t: "st", d: [1, 12, 5, 0, 0, 3, "r", 9, 1] }); await wait(100);
  check(b.last("st") && b.last("st").id === a.id && b.last("st").d[2] === 5, "positions relay to other players");
  check(!a.last("st"), "players don't get their own position echoed");
  a.send({ t: "gate" }); await wait(100);
  check(c.last("gate") && c.last("gate").by === a.id, "gate opening reaches everyone");
  await wait(st.startAt - Date.now() + 300);
  b.send({ t: "finish", penalty: 3, falls: 1 }); await wait(50);
  a.send({ t: "finish", penalty: 0, falls: 0 }); await wait(50);
  c.send({ t: "st", d: [0, 9, 40, 0, 0, 0, "r", 60, 1] });
  c.ws.close(); // Cy drops out mid-race; everyone remaining has finished, so results follow
  await wait(2000);
  const res = a.last("results");
  check(!!res, "results arrive after the remaining players finish");
  if (res) {
    check(res.standings[0].id === a.id && res.standings[0].points === 10, "Ana (no penalty) is 1st with 10 points");
    check(res.standings[1].id === b.id && res.standings[1].time >= 3, "Ben's 3s puddle penalty is counted");
    check(!res.final, "tournament isn't over after race 1");
  }
  check(a.last("room").players.length === 2, "the dropped player left the room");
  a.ws.close(); await wait(200);
  check(b.last("room").host === b.id, "host passes on when the host leaves");
  b.ws.close();
  const failed = checks.filter(x => !x[0]).length;
  console.log(failed ? `${failed} FAILED` : `ALL ${checks.length} PASSED`);
  process.exit(failed ? 1 : 0);
})();
