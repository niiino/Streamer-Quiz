import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

// Health check endpoint für Render
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Streamer Quiz Backend is running" });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", matches: Object.keys(matches).length });
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"],
  allowEIO3: true,
});

// -> Datenhaltung
const matches = {}; // { matchId: { players: [], state: {...} } }

// Hilfsfunktion: Generiere eine 6-stellige Match-ID
function generateMatchId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne O, 0, I, 1
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

io.on("connection", (socket) => {
  console.log("🔌 New connection:", socket.id);
  console.log("📊 Transport:", socket.conn.transport.name);
  console.log("📊 Active matches:", Object.keys(matches).length);

  // Neues Match erstellen
  socket.on("createMatch", (config, callback) => {
    console.log("📥 Received createMatch request from:", socket.id);
    console.log("📥 Config:", config);

    try {
      const matchId = generateMatchId();
      console.log("🎲 Generated matchId:", matchId);

      matches[matchId] = {
        id: matchId,
        host: socket.id,
        players: [],
        config: config || {}, // Theme, Spielmodus, etc.
        state: {
          revealed: {},
          showAnswer: {},
          playerScores: Array(8).fill(0),
          teamScores: Array(4).fill(0),
        },
        createdAt: new Date(),
      };

      socket.join(matchId);
      console.log(`✅ Match created: ${matchId} by ${socket.id}`);
      console.log(`📊 Total matches: ${Object.keys(matches).length}`);

      // WICHTIG: Callback MUSS aufgerufen werden!
      if (typeof callback === "function") {
        callback({ success: true, matchId });
        console.log(`📤 Sent response to ${socket.id}`);
      } else {
        console.error("❌ Callback is not a function!");
      }
    } catch (error) {
      console.error("❌ Error creating match:", error);
      if (typeof callback === "function") {
        callback({ success: false, error: error.message });
      }
    }
  });

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

// Render.com verwendet die PORT Umgebungsvariable
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🌐 Socket.io ready for connections`);
});
