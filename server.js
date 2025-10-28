import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { randomUUID } from "crypto";

const app = express();
app.use(cors());
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// -> Datenhaltung
const matches = {}; // { matchId: { players: [], state: {...} } }

io.on("connection", (socket) => {
  console.log("🔌 New connection:", socket.id);

  // Spieler tritt Match bei
  socket.on("joinMatch", (matchId, playerName) => {
    if (!matches[matchId]) {
      matches[matchId] = { players: [], state: {} };
    }

    matches[matchId].players.push({ id: socket.id, name: playerName });
    socket.join(matchId);

    io.to(matchId).emit("matchUpdate", matches[matchId]);
    console.log(`👥 ${playerName} joined match ${matchId}`);
  });

  // Punkte ändern
  socket.on("changeScore", ({ matchId, playerId, delta }) => {
    const match = matches[matchId];
    if (!match) return;
    const player = match.players.find((p) => p.id === playerId);
    if (player) player.score = (player.score || 0) + delta;
    io.to(matchId).emit("matchUpdate", match);
  });

  // Spieler verlässt Match
  socket.on("disconnect", () => {
    for (const [id, match] of Object.entries(matches)) {
      match.players = match.players.filter((p) => p.id !== socket.id);
      io.to(id).emit("matchUpdate", match);
    }
    console.log("❌ Player disconnected:", socket.id);
  });
});

server.listen(3001, () => {
  console.log("✅ Server läuft auf Port 3001");
});
