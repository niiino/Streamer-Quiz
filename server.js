import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// --- Spieler- & Game-Logik ---
let players = [];
let revealed = {};
let showAnswer = {};
let scores = {};

// Verbindung
io.on("connection", (socket) => {
  console.log(`🔗 Spieler verbunden: ${socket.id}`);
  players.push({ id: socket.id, name: `PLAYER ${players.length + 1}`, score: 0 });

  // Sende aktuelle Daten an neuen Spieler
  socket.emit("init", { players, revealed, showAnswer, scores });

  // An alle broadcasten, dass jemand neu ist
  io.emit("playersUpdate", players);

  // Name ändern
  socket.on("changeName", (newName) => {
    const p = players.find((p) => p.id === socket.id);
    if (p) p.name = newName;
    io.emit("playersUpdate", players);
  });

  // Karte aufdecken
  socket.on("reveal", (key) => {
    revealed[key] = true;
    io.emit("revealedUpdate", revealed);
  });

  // Antwort zeigen
  socket.on("showAnswer", (key) => {
    showAnswer[key] = true;
    io.emit("showAnswerUpdate", showAnswer);
  });

  // Punkte ändern
  socket.on("changeScore", ({ id, delta }) => {
    scores[id] = (scores[id] || 0) + delta;
    io.emit("scoreUpdate", scores);
  });

  // Spieler trennt sich
  socket.on("disconnect", () => {
    players = players.filter((p) => p.id !== socket.id);
    io.emit("playersUpdate", players);
    console.log(`❌ Spieler getrennt: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Socket.IO Server läuft auf Port ${PORT}`));
