# Marble Park

A real-time party game for 2–8 players. Each player races a glass marble through a miniature amusement park from their own phone or computer, and everyone joins with a 4-letter room code.

## How it plays
- **Room codes:** the host creates a room and friends join with the code. Each player picks a marble from the starter set of eight.
- **Game types:** the host chooses a **quick game** (one race) or a **tournament** (three races, with points 10-8-6-5-4-3-2-1).
- **The race:** every race is timed. Marbles bump into each other but never pass through. The course has rails, holes, a bowl, bumpers, a bounce pad, a dissolving puddle (−3 s) and a switch that opens a shortcut gate.
- **Falls:** fall off and you're back at the last First Aid Station, with a short rescue gag.
- **Controls:** drag a finger anywhere on a phone, or use the arrow keys / WASD on a computer.

## How it works
- `game/grand-entrance.html` is the whole game: Three.js graphics, a custom marble physics engine, synthesized original music and sound, and the online client.
- `server/server.js` is a small Node.js WebSocket server. It manages rooms and codes, keeps the race clock (so finish times can't be faked), syncs the shortcut gate, ranks results and relays each player's position to the rest of the room.
- Each device simulates its own marble so steering feels instant. Bumps are resolved by each player for their own marble, so both marbles react without anyone controlling someone else's.

## Run it locally
```
npm install
npm start
```
Then open http://localhost:3000. `node server/test-rooms.js` runs the server's automated room tests.

## Deploying
See [DEPLOY.md](DEPLOY.md): the server runs on Render and the game page is hosted on any static web host.
