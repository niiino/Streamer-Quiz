import React, { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";
import Peer from "peerjs";

// Toggle between local and production
const BACKEND_URL = import.meta.env.DEV
  ? "http://localhost:3001"
  : "https://streamer-quiz-backend.onrender.com";

console.log("🔗 Connecting to backend:", BACKEND_URL);

const socket = io(BACKEND_URL, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export default function App() {
  // =========================
  // MULTIPLAYER STATE (muss ganz oben sein!)
  // =========================
  const [matchId, setMatchId] = useState("");
  const [joined, setJoined] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // =========================
  // GAME STATE (alle Hooks MÜSSEN vor dem return sein!)
  // =========================
  const categories = ["HISTORY", "SCIENCE", "MOVIES", "GAMING", "RANDOM"];
  const pointsOrder = [100, 200, 300, 400, 500];

  const qa = {
    HISTORY: [
      { q: "Wann war der Mauerfall?", a: "1989" },
      { q: "Wer war Julius Caesar?", a: "Römischer Staatsmann" },
      { q: "Wann begann der 2. Weltkrieg?", a: "1939" },
      { q: "Wer entdeckte Amerika?", a: "Christoph Kolumbus" },
      { q: "Wann endete das Mittelalter?", a: "Um 1500" },
    ],
    SCIENCE: [
      { q: "Was ist H2O?", a: "Wasser" },
      { q: "Wie viele Planeten?", a: "8" },
      { q: "Lichtgeschwindigkeit?", a: "299.792 km/s" },
      { q: "Wer entdeckte Relativität?", a: "Albert Einstein" },
      { q: "Was ist DNA?", a: "Erbsubstanz" },
    ],
    MOVIES: [
      { q: "Wer spielte Iron Man?", a: "Robert Downey Jr." },
      { q: "Regisseur von Inception?", a: "Christopher Nolan" },
      { q: "Was ist die Titanic?", a: "Schiff / Filmklassiker" },
      { q: "Oscar 2020?", a: "Parasite" },
      { q: "Was ist Pixar?", a: "Animationsstudio" },
    ],
    GAMING: [
      { q: "Was ist Minecraft?", a: "Sandbox-Spiel" },
      { q: "Wann erschien PS5?", a: "2020" },
      { q: "Was bedeutet GG?", a: "Good Game" },
      { q: "Wer ist Mario?", a: "Nintendo-Maskottchen" },
      { q: "Was ist ein RPG?", a: "Rollenspiel" },
    ],
    RANDOM: [
      { q: "Lieblingsessen?", a: "Pizza 🍕" },
      { q: "Wie spät ist es?", a: "Kommt drauf an 😄" },
      { q: "Was ist Glück?", a: "Subjektives Empfinden" },
      { q: "Hauptstadt von Japan?", a: "Tokio" },
      { q: "Was ist ein Meme?", a: "Witziges Internet-Bild" },
    ],
  };

  const [setupDone, setSetupDone] = useState(false);
  const [theme, setTheme] = useState("normal");
  const [teamMode, setTeamMode] = useState(false);
  const [playerCount, setPlayerCount] = useState(4);
  const [teamCount, setTeamCount] = useState(2);
  const [playersPerTeam, setPlayersPerTeam] = useState(2);
  const [teamColors, setTeamColors] = useState([
    "#3b82f6",
    "#ef4444",
    "#10b981",
    "#a855f7",
  ]);
  const [playerNames, setPlayerNames] = useState(
    Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`)
  );
  const [playerScores, setPlayerScores] = useState(Array(8).fill(0));
  const [teamScores, setTeamScores] = useState(Array(4).fill(0));

  const videoRefs = Array.from({ length: 8 }, () => useRef(null));
  const [playerImages, setPlayerImages] = useState(Array(8).fill(null));
  const [revealed, setRevealed] = useState({});
  const [showAnswer, setShowAnswer] = useState({});
  const [scale, setScale] = useState(1);

  const correctSound = useRef(null);
  const wrongSound = useRef(null);

  // WebRTC States (PeerJS)
  const peerRef = useRef(null); // PeerJS instance
  const connectionsRef = useRef({}); // { peerId: { slotIndex, call } }
  const localStreamsRef = useRef({}); // { slotIndex: MediaStream }
  const [broadcastingSlots, setBroadcastingSlots] = useState([]); // Welche Slots broadcaste ich?
  const [myPeerId, setMyPeerId] = useState(null);

  // =========================
  // EFFECTS
  // =========================
  useEffect(() => {
    // Socket Connection Status
    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id);
      setSocketConnected(true);
      setErrorMessage("");
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
      setSocketConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error);
      setSocketConnected(false);
      setErrorMessage("Verbindung zum Server fehlgeschlagen. Der Server startet möglicherweise gerade. Bitte warte 30-60 Sekunden.");
    });

    socket.on("matchUpdate", (data) => {
      console.log("📥 Match update received:", data);
      setPlayers(data.players);

      // Sync game config from host (for guests)
      if (data.config && !isHost) {
        console.log("🔄 Syncing config from host:", data.config);
        if (data.config.theme) setTheme(data.config.theme);
        if (data.config.teamMode !== undefined) setTeamMode(data.config.teamMode);
        if (data.config.playerCount) setPlayerCount(data.config.playerCount);
        if (data.config.teamCount) setTeamCount(data.config.teamCount);
        if (data.config.playersPerTeam) setPlayersPerTeam(data.config.playersPerTeam);
      }

      // Sync game state (für ALLE Spieler, nicht nur Gäste!)
      if (data.state) {
        console.log("🔄 Syncing game state:", data.state);
        if (data.state.revealed !== undefined) setRevealed(data.state.revealed);
        if (data.state.showAnswer !== undefined) setShowAnswer(data.state.showAnswer);
        if (data.state.playerScores !== undefined) setPlayerScores(data.state.playerScores);
        if (data.state.teamScores !== undefined) setTeamScores(data.state.teamScores);
        if (data.state.playerNames !== undefined) setPlayerNames(data.state.playerNames);
        if (data.state.playerImages !== undefined) setPlayerImages(data.state.playerImages);
      }
    });

    // PeerJS handles WebRTC signaling automatically, no manual events needed!

    // Wake up server on page load (für Render Cold Start)
    const wakeUpServer = async () => {
      try {
        console.log("🏃 Waking up server...");
        const response = await fetch(`${BACKEND_URL}/health`);
        const data = await response.json();
        console.log("✅ Server is awake:", data);
      } catch (error) {
        console.warn("⚠️ Failed to wake up server:", error);
      }
    };
    wakeUpServer();

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("connect_error");
      socket.off("matchUpdate");
    };
  }, [isHost]);

  useEffect(() => {
    correctSound.current = new Audio("/sounds/correct.mp3");
    wrongSound.current = new Audio("/sounds/wrong.mp3");
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = Math.min(w / 1920, h / 1080);
      setScale(s * 0.95);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      @keyframes spiderFloat {
        0%,100% { transform: translateY(0); }
        50% { transform: translateY(80px); }
      }
      .animate-spider {
        animation: spiderFloat 6s ease-in-out infinite;
      }
      @keyframes snowFall {
        0% { transform: translateY(-10%); opacity: 1; }
        100% { transform: translateY(110vh); opacity: 0; }
      }
      .animate-snow {
        position: absolute;
        top: -10%;
        animation: snowFall 8s linear infinite;
      }

      /* Custom Scrollbar Styles - Dezent und passend zum Design */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      ::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.3);
        border-radius: 4px;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(100, 116, 139, 0.5); /* Slate-500 mit Transparenz */
        border-radius: 4px;
        transition: background 0.2s;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: rgba(100, 116, 139, 0.8);
      }

      /* Firefox */
      * {
        scrollbar-width: thin;
        scrollbar-color: rgba(100, 116, 139, 0.5) rgba(0, 0, 0, 0.3);
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (style && style.parentNode) style.parentNode.removeChild(style);
    };
  }, []);

  // =========================
  // WEBRTC FUNCTIONS (PeerJS)
  // =========================

  // Initialize PeerJS when component mounts
  useEffect(() => {
    if (!joined || !socket.id) return;

    console.log("🔗 Initializing PeerJS...");
    const peer = new Peer(socket.id, {
      debug: 2, // Enable logging
    });

    peer.on("open", (id) => {
      console.log(`✅ PeerJS connected with ID: ${id}`);
      setMyPeerId(id);
      peerRef.current = peer;
    });

    peer.on("error", (err) => {
      console.error("❌ PeerJS error:", err);
    });

    // Handle incoming calls
    peer.on("call", (call) => {
      console.log(`📞 Incoming call from ${call.peer} for slot ${call.metadata?.slotIndex}`);

      // Answer the call (we don't send our stream back, just receive)
      call.answer();

      call.on("stream", (remoteStream) => {
        const slotIndex = call.metadata?.slotIndex;
        console.log(`📺 Received stream for slot ${slotIndex}`);

        if (videoRefs[slotIndex]?.current) {
          videoRefs[slotIndex].current.srcObject = remoteStream;
          videoRefs[slotIndex].current.play().catch(err => {
            console.warn("❌ Play failed:", err);
          });
          console.log(`✅ Stream attached to slot ${slotIndex}`);
        }
      });

      call.on("close", () => {
        console.log(`📴 Call closed from ${call.peer}`);
      });

      // Store the call
      if (!connectionsRef.current[call.peer]) {
        connectionsRef.current[call.peer] = {};
      }
      connectionsRef.current[call.peer][call.metadata?.slotIndex] = call;
    });

    return () => {
      if (peer && !peer.destroyed) {
        peer.destroy();
      }
    };
  }, [joined, socket.id]);

  const broadcastCameraToSlot = async (slotIndex, stream) => {
    console.log(`📡 Broadcasting camera to slot ${slotIndex}`);

    if (!peerRef.current) {
      console.error("❌ PeerJS not initialized");
      return;
    }

    // Save the stream locally
    localStreamsRef.current[slotIndex] = stream;
    setBroadcastingSlots((prev) => [...prev, slotIndex]);

    // Get all peers in the match
    socket.emit("requestPeers", { matchId }, (response) => {
      console.log(`📥 Received peers:`, response);

      if (response && response.peers) {
        response.peers.forEach((peerId) => {
          if (peerId !== socket.id && peerId !== myPeerId) {
            console.log(`📞 Calling peer ${peerId} for slot ${slotIndex}`);

            try {
              const call = peerRef.current.call(peerId, stream, {
                metadata: { slotIndex },
              });

              call.on("error", (err) => {
                console.error(`❌ Call error to ${peerId}:`, err);
              });

              // Store the call
              if (!connectionsRef.current[peerId]) {
                connectionsRef.current[peerId] = {};
              }
              connectionsRef.current[peerId][slotIndex] = call;
            } catch (error) {
              console.error(`❌ Failed to call ${peerId}:`, error);
            }
          }
        });
      }
    });

    // Notify others that we're broadcasting
    socket.emit("startBroadcast", {
      matchId,
      slotIndex,
      peerId: myPeerId || socket.id,
    });
  };

  const stopBroadcastingSlot = (slotIndex) => {
    console.log(`🛑 Stopping broadcast for slot ${slotIndex}`);

    const stream = localStreamsRef.current[slotIndex];
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      delete localStreamsRef.current[slotIndex];
    }

    // Close all calls for this slot
    Object.keys(connectionsRef.current).forEach((peerId) => {
      const call = connectionsRef.current[peerId]?.[slotIndex];
      if (call) {
        call.close();
        delete connectionsRef.current[peerId][slotIndex];
      }
    });

    setBroadcastingSlots((prev) => prev.filter((s) => s !== slotIndex));

    // Clear video element
    if (videoRefs[slotIndex]?.current) {
      videoRefs[slotIndex].current.srcObject = null;
    }
  };

  // =========================
  // FUNCTIONS
  // =========================
  const handleCreateQuiz = () => {
    console.log("🎮 Creating quiz...");
    console.log("Socket connected:", socket.connected);

    if (!socket.connected) {
      setErrorMessage("Keine Verbindung zum Server. Der Server startet möglicherweise gerade (Cold Start). Bitte warte 30-60 Sekunden und versuche es erneut.");
      console.error("❌ Socket not connected");
      return;
    }

    setErrorMessage("Quiz wird erstellt... (Falls der Server gerade startet, kann dies bis zu 60 Sekunden dauern)");

    // Längerer Timeout für Render Cold Start
    const timeoutId = setTimeout(() => {
      setErrorMessage("Server antwortet nicht. Der Server braucht möglicherweise länger zum Starten. Bitte versuche es in 30 Sekunden erneut.");
      console.error("❌ createMatch timeout");
    }, 60000); // 60 Sekunden statt 10

    socket.emit("createMatch", {}, (response) => {
      clearTimeout(timeoutId);
      console.log("📥 Server response:", response);

      if (response && response.success) {
        setMatchId(response.matchId);
        setIsHost(true);
        setJoined(true);
        setErrorMessage("");
        console.log("✅ Quiz erstellt:", response.matchId);
      } else {
        setErrorMessage("Fehler beim Erstellen des Quiz. Bitte versuche es erneut.");
        console.error("❌ Failed to create quiz:", response);
      }
    });
  };

  const handleJoin = () => {
    if (!matchId.trim()) {
      setErrorMessage("Bitte gib eine Match-ID ein.");
      return;
    }

    const cleanMatchId = matchId.toUpperCase().trim();
    console.log("👥 Joining match:", cleanMatchId);

    socket.emit("joinMatch", cleanMatchId, playerName || "Unbekannt", (response) => {
      console.log("📥 joinMatch callback received:", response);
      console.log("📥 Response type:", typeof response);
      console.log("📥 Response.success:", response?.success);

      if (response && response.success) {
        console.log("✅ Successfully joined match:", response.match);

        // Lade den aktuellen Match State
        const match = response.match;
        if (match.config) {
          if (match.config.theme) setTheme(match.config.theme);
          if (match.config.teamMode !== undefined) setTeamMode(match.config.teamMode);
          if (match.config.playerCount) setPlayerCount(match.config.playerCount);
          if (match.config.teamCount) setTeamCount(match.config.teamCount);
          if (match.config.playersPerTeam) setPlayersPerTeam(match.config.playersPerTeam);
        }

        if (match.state) {
          if (match.state.revealed) setRevealed(match.state.revealed);
          if (match.state.showAnswer) setShowAnswer(match.state.showAnswer);
          if (match.state.playerScores) setPlayerScores(match.state.playerScores);
          if (match.state.teamScores) setTeamScores(match.state.teamScores);
          if (match.state.playerNames) setPlayerNames(match.state.playerNames);
          if (match.state.playerImages) setPlayerImages(match.state.playerImages);
        }

        if (match.players) {
          setPlayers(match.players);
        }

        // Gäste überspringen das Setup
        setJoined(true);
        setSetupDone(true); // Gäste gehen direkt ins Spiel
        setIsHost(false);
        setMatchId(cleanMatchId);
        setErrorMessage("");
      } else {
        console.error("❌ Failed to join match:", response);
        console.error("❌ Response details:", JSON.stringify(response, null, 2));
        setErrorMessage(response?.error || response?.message || "Match nicht gefunden. Bitte überprüfe die Match-ID.");
      }
    });
  };

  const startCamera = async (slotIndex) => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");

      if (cams.length === 0) {
        alert("Keine Kamera gefunden.");
        return;
      }

      let stream;

      // If only one camera, use it directly
      if (cams.length === 1) {
        console.log(`📹 Using only available camera: ${cams[0].label}`);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: cams[0].deviceId },
          audio: false,
        });
      } else {
        // Multiple cameras - let user choose
        const answer = prompt(
          `Kamera wählen:\n${cams
            .map((c, i) => `${i + 1}: ${c.label || "Kamera " + (i + 1)}`)
            .join("\n")}\n\nNummer eingeben:`
        );

        // User cancelled
        if (!answer) {
          console.log("❌ User cancelled camera selection");
          return;
        }

        const chosen = parseInt(answer, 10) - 1;

        // Invalid number
        if (isNaN(chosen) || chosen < 0 || chosen >= cams.length) {
          alert(`Ungültige Auswahl. Bitte Zahl zwischen 1 und ${cams.length} eingeben.`);
          return;
        }

        console.log(`📹 Using camera: ${cams[chosen].label || `Camera ${chosen + 1}`}`);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: cams[chosen].deviceId },
          audio: false,
        });
      }

      // Show in local video element
      if (videoRefs[slotIndex].current) {
        videoRefs[slotIndex].current.srcObject = stream;
        videoRefs[slotIndex].current.muted = true; // Mute local playback
        videoRefs[slotIndex].current.play().catch(err => {
          console.warn("❌ Local video play failed:", err);
        });
      }

      // Broadcast to all other players via WebRTC
      if (matchId) {
        await broadcastCameraToSlot(slotIndex, stream);
        console.log(`✅ Camera started and broadcasting for slot ${slotIndex}`);
      } else {
        console.log(`✅ Camera started locally for slot ${slotIndex} (no match yet)`);
      }
    } catch (err) {
      console.error("❌ Camera error:", err);
      alert("Kamera konnte nicht gestartet werden: " + err.message);
    }
  };

  const handleImageUpload = (slotIndex, e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (max 500KB for performance)
    if (file.size > 500000) {
      alert("Bild ist zu groß! Bitte wähle ein Bild unter 500KB.");
      return;
    }

    // Convert to Base64 for syncing
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Image = event.target.result;
      const newPlayerImages = [...playerImages];
      newPlayerImages[slotIndex] = base64Image;
      setPlayerImages(newPlayerImages);

      // Sync to all players
      if (matchId) {
        console.log(`📤 Syncing image for player ${slotIndex}`);
        socket.emit("updateGameState", {
          matchId,
          state: { playerImages: newPlayerImages },
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const renamePlayer = (slotIndex) => {
    const newName = prompt("Neuer Name:", playerNames[slotIndex]);
    if (!newName || !newName.trim()) return;

    const newPlayerNames = [...playerNames];
    newPlayerNames[slotIndex] = newName.trim();
    setPlayerNames(newPlayerNames);

    // Sync to all players
    if (matchId) {
      socket.emit("updateGameState", {
        matchId,
        state: { playerNames: newPlayerNames },
      });
    }
  };

  const changePlayerScore = (slotIndex, delta) => {
    const newPlayerScores = [...playerScores];
    newPlayerScores[slotIndex] += delta;
    setPlayerScores(newPlayerScores);

    // Sync to all players
    if (matchId) {
      socket.emit("updateGameState", {
        matchId,
        state: { playerScores: newPlayerScores },
      });
    }
  };

  const changeTeamScore = (teamIndex, delta) => {
    const newTeamScores = [...teamScores];
    newTeamScores[teamIndex] += delta;
    setTeamScores(newTeamScores);

    // Sync to all players
    if (matchId) {
      socket.emit("updateGameState", {
        matchId,
        state: { teamScores: newTeamScores },
      });
    }
  };

  const changeTwoTeamScore = (teamSideIndex, delta) => {
    const newPlayerScores = [...playerScores];
    newPlayerScores[teamSideIndex] += delta;
    setPlayerScores(newPlayerScores);

    // Sync to all players
    if (matchId) {
      socket.emit("updateGameState", {
        matchId,
        state: { playerScores: newPlayerScores },
      });
    }
  };

  const handleReveal = (cat, rowIdx) => {
    const key = `${cat}-${rowIdx}`;
    if (revealed[key]) return;
    setRevealed((p) => {
      const newRevealed = { ...p, [key]: true };

      // Sync to all players
      if (matchId) {
        socket.emit("updateGameState", {
          matchId,
          state: { revealed: newRevealed },
        });
      }

      return newRevealed;
    });
  };

  const handleShowAnswer = (cat, rowIdx) => {
    const key = `${cat}-${rowIdx}`;
    setShowAnswer((p) => {
      const newShowAnswer = { ...p, [key]: true };

      // Sync to all players
      if (matchId) {
        socket.emit("updateGameState", {
          matchId,
          state: { showAnswer: newShowAnswer },
        });
      }

      return newShowAnswer;
    });
  };

  const resetGame = () => {
    const newState = {
      revealed: {},
      showAnswer: {},
      playerScores: Array(8).fill(0),
      teamScores: Array(4).fill(0),
    };

    setRevealed(newState.revealed);
    setShowAnswer(newState.showAnswer);
    setPlayerScores(newState.playerScores);
    setTeamScores(newState.teamScores);

    // Sync to all players
    if (matchId) {
      socket.emit("updateGameState", {
        matchId,
        state: newState,
      });
    }
  };

  const playSound = (type) => {
    if (type === "correct") correctSound.current?.play();
    if (type === "wrong") wrongSound.current?.play();
  };

  function getSinglePlayerSlots() {
    const left = [];
    const right = [];
    const half = Math.ceil(playerCount / 2);
    for (let i = 0; i < playerCount; i++) {
      if (i < half) left.push(i);
      else right.push(i);
    }
    return { left, right };
  }

  function buildTeams() {
    const teams = [];
    const totalPlayers = teamCount * playersPerTeam;
    for (let tIndex = 0; tIndex < teamCount; tIndex++) {
      const members = [];
      for (let p = 0; p < playersPerTeam; p++) {
        const slotIndex = tIndex * playersPerTeam + p;
        if (slotIndex < totalPlayers) {
          members.push(slotIndex);
        }
      }
      teams.push({
        teamIndex: tIndex,
        color: teamColors[tIndex],
        members,
      });
    }
    return teams;
  }

  function splitTeamsForSides(teamsArr) {
    if (teamsArr.length === 2) {
      return {
        mode: "two-big",
        leftTeams: [teamsArr[0]],
        rightTeams: [teamsArr[1]],
      };
    } else {
      return {
        mode: "multi",
        leftTeams: teamsArr.slice(0, 2),
        rightTeams: teamsArr.slice(2, 4),
      };
    }
  }

  function getHeights({ isTwoBigMode, maxBlocksPerSide }) {
    if (isTwoBigMode) {
      return {
        cardHeightPx: 600,
        innerMemberHeightPx: 240,
      };
    } else {
      const maxHeightAvail = 900;
      const h = maxHeightAvail / maxBlocksPerSide;
      const cardHeightPx = Math.min(Math.max(h, 200), 280);
      const innerMemberHeightPx = 100;
      return { cardHeightPx, innerMemberHeightPx };
    }
  }

  // =========================
  // THEME CONFIG
  // =========================
  const themeConfig = {
    normal: {
      bgClass: "from-slate-900 via-slate-800 to-slate-900",
      accentText: "text-cyan-400",
      buttonClass: "bg-cyan-600 hover:bg-cyan-500",
      wallBg: "bg-black/60",
      borderClr: "border-white/10",
      extraEffect: null,
    },
    halloween: {
      bgClass: "bg-black",
      accentText: "text-orange-400",
      buttonClass: "bg-orange-600 hover:bg-orange-500",
      wallBg: "bg-black/70",
      borderClr: "border-orange-500/30",
      extraEffect: (
        <>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute text-3xl animate-spider select-none"
              style={{
                top: "0%",
                left: `${10 + i * 20}%`,
                animationDelay: `${i * 1.8}s`,
                color: "#ff7b00",
              }}
            >
              🕷️
              <div className="absolute top-[-100px] left-1/2 w-[1px] h-[100px] bg-orange-800/40"></div>
            </div>
          ))}
        </>
      ),
    },
    christmas: {
      bgClass: "from-green-900 via-red-900 to-green-800",
      accentText: "text-emerald-300",
      buttonClass: "bg-red-600 hover:bg-red-500",
      wallBg: "bg-black/50",
      borderClr: "border-green-400/30",
      extraEffect: (
        <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none">
          {[...Array(40)].map((_, i) => (
            <div
              key={i}
              className="absolute text-xl animate-snow text-white/90"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                fontSize: `${12 + Math.random() * 18}px`,
                opacity: 0.8,
              }}
            >
              ❄️
            </div>
          ))}
        </div>
      ),
    },
  };
  const t = themeConfig[theme];

  // =========================
  // RENDER: JOIN SCREEN
  // =========================
  if (!joined) {
  return (
    <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="bg-black/60 border border-white/20 rounded-2xl p-8 shadow-2xl w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6">Streamer Quiz</h1>

        {/* Connection Status */}
        <div className="mb-4 text-center">
          {socketConnected ? (
            <div className="text-green-400 text-sm">🟢 Verbunden</div>
          ) : (
            <div className="text-yellow-400 text-sm">🟡 Verbinde zum Server...</div>
          )}
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="mb-4 bg-red-600/20 border border-red-500/50 rounded-lg p-3 text-center">
            <p className="text-red-300 text-sm">{errorMessage}</p>
          </div>
        )}

        {/* Neues Quiz erstellen */}
        <div className="mb-6">
          <button
            onClick={handleCreateQuiz}
            disabled={!socketConnected}
            className={`${
              socketConnected
                ? "bg-green-600 hover:bg-green-500"
                : "bg-gray-600 cursor-not-allowed"
            } text-white font-semibold w-full py-3 rounded-lg mb-2 text-lg transition-colors`}
          >
            + Neues Quiz erstellen
          </button>
          <p className="text-xs text-center text-white/50">Als Host ein neues Spiel starten</p>
        </div>

        {/* Trennlinie */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/20"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-black/60 text-white/50">oder</span>
          </div>
        </div>

        {/* Match beitreten */}
        <h2 className="text-lg font-semibold text-center mb-4">Match beitreten</h2>
        <input
          value={matchId}
          onChange={(e) => setMatchId(e.target.value)}
          placeholder="Match ID eingeben (z.B. ABC123)"
          className="bg-slate-800 w-full px-3 py-2 rounded-lg mb-3 text-center uppercase"
        />
        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="Dein Name"
          className="bg-slate-800 w-full px-3 py-2 rounded-lg mb-3 text-center"
        />
        <button
          onClick={handleJoin}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold w-full py-2 rounded-lg"
        >
          Beitreten
        </button>
      </div>
    </div>
  );
  }

  // =========================
  // SETUP SCREEN
  // =========================
  if (!setupDone) {
    return (
      <div
        className={`w-screen h-screen flex items-center justify-center bg-gradient-to-br ${t.bgClass} text-white relative overflow-hidden`}
      >
        {t.extraEffect}

        <div className="relative z-10 bg-black/60 border border-white/20 rounded-2xl p-8 shadow-2xl w-full max-w-xl">
          <h1 className="text-3xl font-bold text-center mb-6">QUIZ SETUP</h1>

          {/* Theme Auswahl */}
          <div className="mb-6 text-center">
            <p className="mb-2 font-semibold">🎨 Theme wählen:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {["normal", "halloween", "christmas"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setTheme(mode)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                    theme === mode ? t.buttonClass : "bg-slate-700"
                  }`}
                >
                  {mode === "normal" && "🌑 Normal"}
                  {mode === "halloween" && "🎃 Halloween"}
                  {mode === "christmas" && "🎄 Christmas"}
                </button>
              ))}
            </div>
          </div>

          {/* Modus Auswahl */}
          <div className="mb-6 text-center">
            <p className="mb-2 font-semibold">Spielmodus:</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setTeamMode(false)}
                className={`px-4 py-2 rounded-lg ${
                  !teamMode ? t.buttonClass : "bg-slate-700"
                }`}
              >
                Einzelspieler
              </button>

              <button
                onClick={() => setTeamMode(true)}
                className={`px-4 py-2 rounded-lg ${
                  teamMode ? t.buttonClass : "bg-slate-700"
                }`}
              >
                Teammodus
              </button>
            </div>
          </div>

          {/* Einzelspieler-Optionen */}
          {!teamMode && (
            <div className="mb-6">
              <label className="block text-sm mb-2 font-semibold">
                Anzahl Spieler (1-8):
              </label>
              <select
                value={playerCount}
                onChange={(e) => setPlayerCount(Number(e.target.value))}
                className="w-full bg-slate-800 rounded-lg px-3 py-2 text-center"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Team-Optionen */}
          {teamMode && (
            <div className="space-y-6 mb-6">
              <div>
                <label className="block text-sm mb-2 font-semibold">
                  Anzahl Teams (2-4):
                </label>
                <select
                  value={teamCount}
                  onChange={(e) =>
                    setTeamCount(Math.max(2, Number(e.target.value)))
                  }
                  className="w-full bg-slate-800 rounded-lg px-3 py-2 text-center"
                >
                  {[2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-2 font-semibold">
                  Spieler pro Team (1-2):
                </label>
                <select
                  value={playersPerTeam}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    // Sicherheit: max insgesamt = 8
                    if (val * teamCount > 8) return;
                    setPlayersPerTeam(val);
                  }}
                  className="w-full bg-slate-800 rounded-lg px-3 py-2 text-center"
                >
                  {[1, 2].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-sm mb-2 font-semibold text-center">
                  Team-Farben:
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  {Array.from({ length: teamCount }, (_, i) => (
                    <div key={i} className="flex flex-col items-center">
                      <span className="text-xs mb-1">Team {i + 1}</span>
                      <input
                        type="color"
                        value={teamColors[i]}
                        onChange={(e) => {
                          setTeamColors((prev) => {
                            const cp = [...prev];
                            cp[i] = e.target.value;
                            return cp;
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="text-center">
            <button
              onClick={() => {
                setSetupDone(true);

                // Host sendet Konfiguration an alle Spieler
                if (isHost && matchId) {
                  console.log("📤 Sending config to all players");
                  socket.emit("updateConfig", {
                    matchId,
                    config: {
                      theme,
                      teamMode,
                      playerCount,
                      teamCount,
                      playersPerTeam,
                    },
                  });
                }
              }}
              className={`${t.buttonClass} text-white font-semibold px-6 py-3 rounded-xl shadow-lg transition`}
            >
              ▶️ Spiel starten
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================
  // GAME SCREEN
  // =========================

  // --- Einzelspieler Layout vorbereiten ---
  const { left: singleLeftSlots, right: singleRightSlots } =
    getSinglePlayerSlots();

  // --- Team Layout vorbereiten ---
  const teams = buildTeams(); // [{teamIndex,color,members:[slotIndex,...]}, ...]
  const { mode: teamLayoutMode, leftTeams, rightTeams } =
    splitTeamsForSides(teams);

  // Bestimmen, wie viele Blöcke auf jeder Seite gestapelt werden
  const leftBlockCount = !teamMode
    ? singleLeftSlots.length
    : leftTeams.length;
  const rightBlockCount = !teamMode
    ? singleRightSlots.length
    : rightTeams.length;
  const maxBlocksPerSide = Math.max(
    leftBlockCount,
    rightBlockCount,
    1
  );

  // Größe der Karten dynamisch ermitteln
  const { cardHeightPx, innerMemberHeightPx } = getHeights({
    isTwoBigMode: teamMode && teamLayoutMode === "two-big",
    maxBlocksPerSide,
  });

  // RENDER
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br ${t.bgClass} text-white font-sans relative overflow-hidden`}
      style={{ width: "100vw", height: "100vh" }}
    >
      {t.extraEffect}

      <div
        className="relative z-10 flex flex-col items-center justify-start"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          width: "1920px",
          height: "1000px", // Erhöht von 1000px auf 1200px
        }}
      >
        {/* OBERER BLOCK: linke Seite / Wall / rechte Seite */}
        <div className="flex flex-row items-start justify-center gap-8 w-full flex-1">
          {/* LINKE SEITE */}
          <div className="flex flex-col gap-4">
            {!teamMode
              ? singleLeftSlots.map((slotIndex) => (
                  <PlayerCard
                    key={slotIndex}
                    slotIndex={slotIndex}
                    heightPx={cardHeightPx}
                    name={playerNames[slotIndex]}
                    score={playerScores[slotIndex]}
                    videoRef={videoRefs[slotIndex]}
                    image={playerImages[slotIndex]}
                    renamePlayer={() => renamePlayer(slotIndex)}
                    startCamera={() => startCamera(slotIndex)}
                    uploadImage={(e) => handleImageUpload(slotIndex, e)}
                    onCorrect={() => {
                      changePlayerScore(slotIndex, +100);
                      playSound("correct");
                    }}
                    onWrong={() => {
                      changePlayerScore(slotIndex, -100);
                      playSound("wrong");
                    }}
                  />
                ))
              : leftTeams.map((teamObj) =>
                  teamLayoutMode === "two-big" ? (
                    <BigTeamCard
                      key={teamObj.teamIndex}
                      heightPx={cardHeightPx}
                      teamColor={teamObj.color}
                      teamIndex={teamObj.teamIndex}
                      // Score bei 2 Teams speichern wir in playerScores[0/1]
                      score={
                        teamCount === 2
                          ? playerScores[teamObj.teamIndex] // Team1->index0, Team2->index1
                          : teamScores[teamObj.teamIndex]
                      }
                      onCorrect={() => {
                        if (teamCount === 2) {
                          changeTwoTeamScore(teamObj.teamIndex, +100);
                        } else {
                          changeTeamScore(teamObj.teamIndex, +100);
                        }
                        playSound("correct");
                      }}
                      onWrong={() => {
                        if (teamCount === 2) {
                          changeTwoTeamScore(teamObj.teamIndex, -100);
                        } else {
                          changeTeamScore(teamObj.teamIndex, -100);
                        }
                        playSound("wrong");
                      }}
                      members={teamObj.members.map((slotIndex) => ({
                        slotIndex,
                        name: playerNames[slotIndex],
                        videoRef: videoRefs[slotIndex],
                        image: playerImages[slotIndex],
                        renamePlayer: () => renamePlayer(slotIndex),
                        startCamera: () => startCamera(slotIndex),
                        uploadImage: (e) => handleImageUpload(slotIndex, e),
                      }))}
                      innerMemberHeightPx={innerMemberHeightPx}
                    />
                  ) : (
                    <SmallTeamCard
                      key={teamObj.teamIndex}
                      heightPx={cardHeightPx}
                      teamColor={teamObj.color}
                      teamIndex={teamObj.teamIndex}
                      score={teamScores[teamObj.teamIndex]}
                      onCorrect={() => {
                        changeTeamScore(teamObj.teamIndex, +100);
                        playSound("correct");
                      }}
                      onWrong={() => {
                        changeTeamScore(teamObj.teamIndex, -100);
                        playSound("wrong");
                      }}
                      members={teamObj.members.map((slotIndex) => ({
                        slotIndex,
                        name: playerNames[slotIndex],
                        videoRef: videoRefs[slotIndex],
                        image: playerImages[slotIndex],
                        renamePlayer: () => renamePlayer(slotIndex),
                        startCamera: () => startCamera(slotIndex),
                        uploadImage: (e) => handleImageUpload(slotIndex, e),
                      }))}
                      innerMemberHeightPx={innerMemberHeightPx}
                    />
                  )
                )}
          </div>

          {/* QUIZ WALL IN DER MITTE */}
          <div className="flex flex-col items-center">
            {/* Match-ID Anzeige (wenn Host) */}
            {isHost && matchId && (
              <div className="mb-4 bg-green-600/20 border border-green-500/50 rounded-lg px-6 py-3 text-center">
                <p className="text-xs text-green-300 mb-1">Match-ID zum Teilen:</p>
                <p className="text-2xl font-bold text-green-400 tracking-widest select-all">
                  {matchId}
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(matchId);
                    alert("Match-ID kopiert!");
                  }}
                  className="mt-2 text-xs text-green-300 hover:text-green-100 underline"
                >
                  In Zwischenablage kopieren
                </button>
              </div>
            )}

            <QuizWall
              t={t}
              categories={categories}
              pointsOrder={pointsOrder}
              qa={qa}
              revealed={revealed}
              showAnswer={showAnswer}
              handleReveal={handleReveal}
              handleShowAnswer={handleShowAnswer}
            />

            {/* Buttons unten */}
            <div className="flex justify-center gap-4 mt-4">
              <button
                onClick={resetGame}
                className={`${t.buttonClass} text-white font-semibold px-6 py-2 rounded-lg shadow-lg transition`}
              >
                Neues Spiel
              </button>
              <button
                onClick={() => {
                  resetGame();
                  setSetupDone(false);
                }}
                className={`${t.buttonClass} text-white font-semibold px-6 py-2 rounded-lg shadow-lg transition`}
              >
                ⬅️ Zurück ins Menü
              </button>
            </div>
          </div>

          {/* RECHTE SEITE */}
          <div className="flex flex-col gap-4">
            {!teamMode
              ? singleRightSlots.map((slotIndex) => (
                  <PlayerCard
                    key={slotIndex}
                    slotIndex={slotIndex}
                    heightPx={cardHeightPx}
                    name={playerNames[slotIndex]}
                    score={playerScores[slotIndex]}
                    videoRef={videoRefs[slotIndex]}
                    image={playerImages[slotIndex]}
                    renamePlayer={() => renamePlayer(slotIndex)}
                    startCamera={() => startCamera(slotIndex)}
                    uploadImage={(e) => handleImageUpload(slotIndex, e)}
                    onCorrect={() => {
                      changePlayerScore(slotIndex, +100);
                      playSound("correct");
                    }}
                    onWrong={() => {
                      changePlayerScore(slotIndex, -100);
                      playSound("wrong");
                    }}
                  />
                ))
              : rightTeams.map((teamObj) =>
                  teamLayoutMode === "two-big" ? (
                    <BigTeamCard
                      key={teamObj.teamIndex}
                      heightPx={cardHeightPx}
                      teamColor={teamObj.color}
                      teamIndex={teamObj.teamIndex}
                      score={
                        teamCount === 2
                          ? playerScores[teamObj.teamIndex] // 0/1
                          : teamScores[teamObj.teamIndex]
                      }
                      onCorrect={() => {
                        if (teamCount === 2) {
                          changeTwoTeamScore(teamObj.teamIndex, +100);
                        } else {
                          changeTeamScore(teamObj.teamIndex, +100);
                        }
                        playSound("correct");
                      }}
                      onWrong={() => {
                        if (teamCount === 2) {
                          changeTwoTeamScore(teamObj.teamIndex, -100);
                        } else {
                          changeTeamScore(teamObj.teamIndex, -100);
                        }
                        playSound("wrong");
                      }}
                      members={teamObj.members.map((slotIndex) => ({
                        slotIndex,
                        name: playerNames[slotIndex],
                        videoRef: videoRefs[slotIndex],
                        image: playerImages[slotIndex],
                        renamePlayer: () => renamePlayer(slotIndex),
                        startCamera: () => startCamera(slotIndex),
                        uploadImage: (e) => handleImageUpload(slotIndex, e),
                      }))}
                      innerMemberHeightPx={innerMemberHeightPx}
                    />
                  ) : (
                    <SmallTeamCard
                      key={teamObj.teamIndex}
                      heightPx={cardHeightPx}
                      teamColor={teamObj.color}
                      teamIndex={teamObj.teamIndex}
                      score={teamScores[teamObj.teamIndex]}
                      onCorrect={() => {
                        changeTeamScore(teamObj.teamIndex, +100);
                        playSound("correct");
                      }}
                      onWrong={() => {
                        changeTeamScore(teamObj.teamIndex, -100);
                        playSound("wrong");
                      }}
                      members={teamObj.members.map((slotIndex) => ({
                        slotIndex,
                        name: playerNames[slotIndex],
                        videoRef: videoRefs[slotIndex],
                        image: playerImages[slotIndex],
                        renamePlayer: () => renamePlayer(slotIndex),
                        startCamera: () => startCamera(slotIndex),
                        uploadImage: (e) => handleImageUpload(slotIndex, e),
                      }))}
                      innerMemberHeightPx={innerMemberHeightPx}
                    />
                  )
                )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================
// QUIZ WALL
// =========================
function QuizWall({
  t,
  categories,
  pointsOrder,
  qa,
  revealed,
  showAnswer,
  handleReveal,
  handleShowAnswer,
}) {
  return (
    <section
      className={`rounded-2xl ${t.wallBg} backdrop-blur-md border ${t.borderClr} shadow-xl p-4 flex flex-col gap-4 w-[1000px]`}
    >
      {/* Kategorien */}
      <div className="grid grid-cols-5 gap-3 w-full">
        {categories.map((cat, i) => (
          <div
            key={i}
            className="rounded-lg bg-gradient-to-b from-black/30 to-black/50 border border-white/10 text-center py-2"
          >
            <div
              className={`text-[10px] tracking-wider ${t.accentText} font-semibold`}
            >
              CATEGORY
            </div>
            <div className="text-sm font-bold text-white">{cat}</div>
          </div>
        ))}
      </div>

      {/* Fragen-Grid */}
      <div className="grid grid-cols-5 gap-3 w-full">
        {pointsOrder
          .slice()
          .reverse() // damit 100 oben / 500 unten passt: wir haben original 100..500, drehen es hier NICHT nochmal
          .map((points, rowIdxFromBottom) => {
            // wenn pointsOrder ist [100,200,300,400,500]
            // und wir reverse() -> [500,400,300,200,100]
            // rowIdxFromBottom 0 => 500
            // wir wollen index für qa: 0=>100,1=>200,... also wir drehen hier wieder um:
            const qaRowIndex = pointsOrder.indexOf(points);

            return categories.map((cat) => {
              const key = `${cat}-${qaRowIndex}`;
              const isRevealed = revealed[key];
              const answered = showAnswer[key];
              const { q, a } = qa[cat][qaRowIndex];
              return (
                <div
                  key={key}
                  onClick={() => handleReveal(cat, qaRowIndex)}
                  className="aspect-[4/3] rounded-lg cursor-pointer bg-gradient-to-b from-black/40 to-black/70 border border-white/10 flex items-center justify-center p-2 text-center text-white"
                >
                  {!isRevealed ? (
                    <span className="text-3xl font-extrabold text-cyan-400 select-none">
                      {points}
                    </span>
                  ) : !answered ? (
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-sm font-semibold mb-2">{q}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShowAnswer(cat, qaRowIndex);
                        }}
                        className={`${t.buttonClass} mt-1 text-xs px-3 py-1 rounded-md`}
                      >
                        Antwort zeigen
                      </button>
                    </div>
                  ) : (
                    <div className="text-lime-400 text-sm font-semibold">
                      {a}
                    </div>
                  )}
                </div>
              );
            });
          })}
      </div>
    </section>
  );
}

// =========================
// EINZELSPIELER-KARTE
// =========================
function PlayerCard({
  slotIndex,
  heightPx,
  name,
  score,
  videoRef,
  image,
  renamePlayer,
  startCamera,
  uploadImage,
  onCorrect,
  onWrong,
}) {
  return (
    <div
      className="relative rounded-xl bg-slate-900/70 border border-white/10 shadow-lg flex flex-col overflow-hidden w-[320px]"
      style={{
        height: `${heightPx}px`,
      }}
    >
      {/* Kamera / Bild */}
      {image ? (
        <img
          src={image}
          alt="player"
          className="w-full flex-1 object-cover bg-black"
          style={{ minHeight: 0 }}
        />
      ) : (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full flex-1 object-cover bg-black"
          style={{ minHeight: 0 }}
        ></video>
      )}

      <div className="bg-black/60 text-[0.7rem] flex flex-col p-2 gap-2">
        {/* Name + Kamera */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col">
            <div className="text-white font-semibold leading-none truncate max-w-[160px]">
              {name}
            </div>
            <button
              onClick={renamePlayer}
              className="text-cyan-400 hover:text-cyan-200 text-[0.6rem] leading-none text-left"
            >
              ✏️ Name ändern
            </button>
          </div>

          <div className="flex flex-col items-end gap-1">
            <button
              onClick={startCamera}
              className="text-cyan-400 hover:text-cyan-200 text-[0.6rem] leading-none"
            >
              🎥 Kamera starten
            </button>
            <label className="text-[0.6rem] text-cyan-400 hover:text-cyan-200 cursor-pointer leading-none">
              Bild
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={uploadImage}
              />
            </label>
          </div>
        </div>

        {/* Punkte + Richtig/Falsch */}
        <div className="flex flex-col gap-2 bg-slate-800/60 rounded-lg p-2">
          <div className="flex items-center justify-between">
            <span className="text-white/70 text-[0.65rem] leading-none">
              Punkte:
            </span>
            <span className="text-cyan-300 w-14 text-center text-[0.8rem] font-bold">
              {score}
            </span>
          </div>
          <div className="flex items-center justify-between text-[0.7rem] gap-2">
            <button
              onClick={onCorrect}
              className="bg-green-600/70 hover:bg-green-600 text-white px-2 py-1 rounded text-[0.7rem] flex-1 text-center"
            >
              ✅ Richtig (+100)
            </button>
            <button
              onClick={onWrong}
              className="bg-red-600/70 hover:bg-red-600 text-white px-2 py-1 rounded text-[0.7rem] flex-1 text-center"
            >
              ❌ Falsch (-100)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================
// TEAM-KARTEN
// =========================

// Große Karte (2-Team-Layout)
function BigTeamCard({
  heightPx,
  teamColor,
  teamIndex,
  score,
  onCorrect,
  onWrong,
  members,
  innerMemberHeightPx,
}) {
  return (
    <div
      className="relative rounded-xl bg-slate-900/70 border border-white/10 shadow-lg flex flex-col overflow-hidden w-[400px]"
      style={{
        height: `${heightPx}px`,
        borderColor: teamColor,
        boxShadow: `0 0 20px ${teamColor}66`,
      }}
    >
      {/* Team Kopf */}
      <div
        className="p-3 text-[0.8rem] flex items-center justify-between"
        style={{
          backgroundColor: `${teamColor}22`,
          borderBottom: `1px solid ${teamColor}`,
          color: "#fff",
        }}
      >
        <div className="font-bold text-[0.9rem]" style={{ color: teamColor }}>
          TEAM {teamIndex + 1}
        </div>
        <div className="flex flex-col items-end">
          <div className="text-white font-bold text-[1rem] leading-none">
            {score}
          </div>
          <div className="flex gap-2 mt-1 text-[0.7rem]">
            <button
              onClick={onCorrect}
              className="bg-green-600/70 hover:bg-green-600 text-white px-2 py-1 rounded"
            >
              ✅ +100
            </button>
            <button
              onClick={onWrong}
              className="bg-red-600/70 hover:bg-red-600 text-white px-2 py-1 rounded"
            >
              ❌ -100
            </button>
          </div>
        </div>
      </div>

      {/* Mitglieder */}
      <div className="flex-1 flex flex-col gap-2 p-3 overflow-y-auto">
        {members.map((m, i) => (
          <div
            key={i}
            className="flex flex-col bg-black/60 rounded-lg border border-white/10 overflow-visible"
          >
            {/* Video/Bild Bereich - 16:9 Aspect Ratio */}
            <div className="relative w-full bg-black" style={{ aspectRatio: "16 / 9" }}>
              {m.image ? (
                <img
                  src={m.image}
                  alt={m.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  ref={m.videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                ></video>
              )}
            </div>

            {/* Info & Buttons Bereich */}
            <div className="flex items-center justify-between p-2 bg-slate-800/80 text-white">
              <div className="flex flex-col gap-1 flex-1">
                <div className="truncate font-semibold text-[0.8rem] max-w-[150px]">
                  {m.name}
                </div>
                <div className="flex gap-2 text-[0.65rem]">
                  <button
                    onClick={m.renamePlayer}
                    className="text-cyan-400 hover:text-cyan-200"
                  >
                    ✏️ Name
                  </button>
                  <button
                    onClick={m.startCamera}
                    className="text-cyan-400 hover:text-cyan-200"
                  >
                    🎥 Cam
                  </button>
                  <label className="text-cyan-400 hover:text-cyan-200 cursor-pointer">
                    🖼️ Bild
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={m.uploadImage}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Kleinere Karte (3-4 Teams Layout)
function SmallTeamCard({
  heightPx,
  teamColor,
  teamIndex,
  score,
  onCorrect,
  onWrong,
  members,
  innerMemberHeightPx,
}) {
  return (
    <div
      className="relative rounded-xl bg-slate-900/70 border border-white/10 shadow-lg flex flex-col overflow-hidden w-[320px]"
      style={{
        height: `${heightPx}px`,
        borderColor: teamColor,
        boxShadow: `0 0 16px ${teamColor}66`,
      }}
    >
      {/* Team Kopf */}
      <div
        className="p-2 text-[0.7rem] flex items-center justify-between"
        style={{
          backgroundColor: `${teamColor}22`,
          borderBottom: `1px solid ${teamColor}`,
          color: "#fff",
        }}
      >
        <div
          className="font-bold text-[0.8rem]"
          style={{ color: teamColor }}
        >
          TEAM {teamIndex + 1}
        </div>

        <div className="flex flex-col items-end">
          <div className="text-white font-bold text-[0.9rem] leading-none">
            {score}
          </div>
          <div className="flex gap-1 mt-1 text-[0.6rem]">
            <button
              onClick={onCorrect}
              className="bg-green-600/70 hover:bg-green-600 text-white px-2 py-1 rounded"
            >
              ✅ +100
            </button>
            <button
              onClick={onWrong}
              className="bg-red-600/70 hover:bg-red-600 text-white px-2 py-1 rounded"
            >
              ❌ -100
            </button>
          </div>
        </div>
      </div>

      {/* Mitglieder */}
      <div className="flex-1 flex flex-col gap-2 p-2 overflow-y-auto">
        {members.map((m, i) => (
          <div
            key={i}
            className="flex flex-col bg-black/60 rounded-lg border border-white/10 overflow-visible"
          >
            {/* Video/Bild Bereich - 16:9 Aspect Ratio */}
            <div className="relative w-full bg-black" style={{ aspectRatio: "16 / 9" }}>
              {m.image ? (
                <img
                  src={m.image}
                  alt={m.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  ref={m.videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                ></video>
              )}
            </div>

            {/* Info & Buttons Bereich */}
            <div className="flex items-center justify-between p-1.5 bg-slate-800/80 text-white">
              <div className="flex flex-col gap-0.5 flex-1">
                <div className="truncate font-semibold text-[0.7rem] max-w-[120px]">
                  {m.name}
                </div>
                <div className="flex gap-1.5 text-[0.6rem]">
                  <button
                    onClick={m.renamePlayer}
                    className="text-cyan-400 hover:text-cyan-200"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={m.startCamera}
                    className="text-cyan-400 hover:text-cyan-200"
                  >
                    🎥
                  </button>
                  <label className="text-cyan-400 hover:text-cyan-200 cursor-pointer">
                    🖼️
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={m.uploadImage}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
