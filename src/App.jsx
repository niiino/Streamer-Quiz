import { io } from "socket.io-client";

const socket = io("https://streamer-quiz-backend.onrender.com");
useEffect(() => {
  socket.on("updateGame", (data) => {
    setPlayerNames(data.players.map(p => p.name));
    setPlayerScores(data.players.map(p => p.score));
    setRevealed(data.revealed);
    setShowAnswer(data.showAnswer);
  });
}, []);
import React, { useState, useRef, useEffect } from "react";

export default function App() {
  // =========================
  // QUIZ DATEN
  // =========================
  const categories = ["HISTORY", "SCIENCE", "MOVIES", "GAMING", "RANDOM"];
  const pointsOrder = [100, 200, 300, 400, 500]; // 100 oben, 500 unten

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

  // =========================
  // STATE
  // =========================

  // Setup / Ansicht
  const [setupDone, setSetupDone] = useState(false);

  // Theme: "normal" | "halloween" | "christmas"
  const [theme, setTheme] = useState("normal");

  // Spielmodus
  // false => Einzelspieler
  // true  => Teammodus
  const [teamMode, setTeamMode] = useState(false);

  // Einzelspieler-Einstellungen
  const [playerCount, setPlayerCount] = useState(4); // 1-8

  // Team-Einstellungen
  const [teamCount, setTeamCount] = useState(2); // 2-4
  const [playersPerTeam, setPlayersPerTeam] = useState(2); // 1-2 (max 8 total)
  // Farben pro Team
  const [teamColors, setTeamColors] = useState([
    "#3b82f6", // Team 1 blau
    "#ef4444", // Team 2 rot
    "#10b981", // Team 3 grün
    "#a855f7", // Team 4 lila
  ]);

  // Spieler/Slots allgemein (max 8 Slots total)
  const [playerNames, setPlayerNames] = useState(
    Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`)
  );

  // Punkte:
  // - Einzelspieler: Punkte pro Spieler-Slot
  // - Teammodus:
  //    - wenn 2 Teams: Score Team1 = Slot0, Team2 = Slot1 (statisch)
  //    - wenn 3-4 Teams: Score pro Team separat
  const [playerScores, setPlayerScores] = useState(Array(8).fill(0));
  const [teamScores, setTeamScores] = useState(Array(4).fill(0));

  // Kameras + Bilder
  const videoRefs = Array.from({ length: 8 }, () => useRef(null));
  const [playerImages, setPlayerImages] = useState(Array(8).fill(null));

  // Quizzustand
  const [revealed, setRevealed] = useState({}); // { "CAT-idx": true }
  const [showAnswer, setShowAnswer] = useState({}); // { "CAT-idx": true }

  // Skalierung
  const [scale, setScale] = useState(1);

  // Sounds
  const correctSound = useRef(null);
  const wrongSound = useRef(null);

  useEffect(() => {
    // Sound-Dateien musst du ins public legen:
    // public/sounds/correct.mp3
    // public/sounds/wrong.mp3
    correctSound.current = new Audio("/sounds/correct.mp3");
    wrongSound.current = new Audio("/sounds/wrong.mp3");
  }, []);

  const playSound = (type) => {
    if (type === "correct") correctSound.current?.play();
    if (type === "wrong") wrongSound.current?.play();
  };

  // Dynamische Skalierung, damit alles auf den Screen passt
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

  // =========================
  // HELFERFUNKTIONEN
  // =========================

  // Kamera starten für einen Slot
  const startCamera = async (slotIndex) => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      if (cams.length === 0) {
        alert("Keine Kamera gefunden.");
        return;
      }
      // einfache Auswahl
      const answer = prompt(
        `Kamera wählen:\n${cams
          .map((c, i) => `${i + 1}: ${c.label || "Kamera " + (i + 1)}`)
          .join("\n")}\n\nNummer eingeben:`
      );
      const chosen = parseInt(answer, 10) - 1;
      if (chosen < 0 || chosen >= cams.length) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: cams[chosen].deviceId },
      });

      if (videoRefs[slotIndex].current) {
        videoRefs[slotIndex].current.srcObject = stream;
      }
    } catch (err) {
      alert("Kamera konnte nicht gestartet werden: " + err.message);
    }
  };

  // Bild hochladen (statt Kamera)
  const handleImageUpload = (slotIndex, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPlayerImages((prev) => {
      const copy = [...prev];
      copy[slotIndex] = url;
      return copy;
    });
  };

  // Namen bearbeiten
  const renamePlayer = (slotIndex) => {
    const newName = prompt("Neuer Name:", playerNames[slotIndex]);
    if (!newName || !newName.trim()) return;
    setPlayerNames((prev) => {
      const copy = [...prev];
      copy[slotIndex] = newName.trim();
      return copy;
    });
  };

  // Punkte ändern in Einzelspieler-Modus
  const changePlayerScore = (slotIndex, delta) => {
    setPlayerScores((prev) => {
      const copy = [...prev];
      copy[slotIndex] += delta;
  
      // 🧩 Sende Änderung an Server
      socket.emit("changeScore", {
        playerId: slotIndex,
        delta,
        newScore: copy[slotIndex],
      });
  
      return copy;
    });
  };
  

  // Punkte ändern für Teams (3+ Teams Variante)
  const changeTeamScore = (teamIndex, delta) => {
    setTeamScores((prev) => {
      const copy = [...prev];
      copy[teamIndex] += delta;
      return copy;
    });
  };

  // Punkte ändern für 2-Team-Ansicht (Team 1 links, Team 2 rechts)
  const changeTwoTeamScore = (teamSideIndex, delta) => {
    // Wir benutzen playerScores[0] für Team 1, playerScores[1] für Team 2
    setPlayerScores((prev) => {
      const copy = [...prev];
      copy[teamSideIndex] += delta;
      return copy;
    });
  };

  // Karte aufdecken
  const handleReveal = (cat, rowIdx) => {
    const key = `${cat}-${rowIdx}`;
    if (revealed[key]) return; // schon offen
    setRevealed((p) => ({ ...p, [key]: true }));
  };

  // Antwort zeigen
  const handleShowAnswer = (cat, rowIdx) => {
    const key = `${cat}-${rowIdx}`;
    setShowAnswer((p) => ({ ...p, [key]: true }));
  };

  // Voller Reset
  const resetGame = () => {
    setRevealed({});
    setShowAnswer({});
    setPlayerScores(Array(8).fill(0));
    setTeamScores(Array(4).fill(0));
  };

  // =========================
  // THEME STYLES
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

  // Animation CSS (Spinne / Schnee)
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
    `;
    document.head.appendChild(style);
    return () => {
      if (style && style.parentNode) style.parentNode.removeChild(style);
    };
  }, []);

  // =========================
  // HILFS-LAYOUTS
  // =========================

  // Einzelspieler: wir verteilen playerCount Spieler auf links/rechts
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

  // Teammodus:
  // Wir bauen Teams wie folgt:
  // teamCount = 2..4
  // playersPerTeam = 1..2 (gesamt max 8)
  // Wir geben jedes Team ein Objekt { teamIndex, color, memberSlots[], scoreGetter/setter }
  function buildTeams() {
    const teams = [];
    const totalPlayers = teamCount * playersPerTeam; // max 8
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

  // Für 2 Teams: links Team[0], rechts Team[1], schön groß
  // Für 3-4 Teams: wir verteilen sie wie vorher (zwei Spalten links, zwei rechts)
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

  // Wie groß sind die Karten?
  // - Einzelspieler: jede Karte ist gleich groß gestapelt
  // - Team multi: jede TeamCard ähnlich wie EinzelspielerCard
  // - Team two-big: die TeamCard ist größer
  function getHeights({ isTwoBigMode, maxBlocksPerSide }) {
    // Wir haben vertikal ~800px Platz nach Skalierung
    // isTwoBigMode => pro Seite nur 1 großes Team, darf groß sein
    if (isTwoBigMode) {
      return {
        cardHeightPx: 600, // große Teams links/rechts
        innerMemberHeightPx: 240,
      };
    } else {
      // sonst mehrere Blöcke untereinander
      const maxHeightAvail = 900;
      const h = maxHeightAvail / maxBlocksPerSide;
      const cardHeightPx = Math.min(Math.max(h, 200), 280);
      const innerMemberHeightPx = 100;
      return { cardHeightPx, innerMemberHeightPx };
    }
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
              onClick={() => setSetupDone(true)}
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
          height: "1000px",
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
      <div className="flex-1 grid grid-cols-1 gap-2 p-3 overflow-hidden">
        {members.map((m, i) => (
          <div
            key={i}
            className="flex bg-black/60 rounded-lg border border-white/10 overflow-hidden"
            style={{
              minHeight: 0,
              height: `${innerMemberHeightPx}px`,
            }}
          >
            <div className="flex-1 bg-black">
              {m.image ? (
                <img
                  src={m.image}
                  alt={m.name}
                  className="w-full h-full object-cover bg-black"
                />
              ) : (
                <video
                  ref={m.videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover bg-black"
                ></video>
              )}
            </div>

            <div className="flex flex-col justify-between p-2 text-[0.7rem] w-[130px] text-white">
              <div className="truncate font-semibold leading-none max-w-[120px]">
                {m.name}
              </div>
              <button
                onClick={m.renamePlayer}
                className="text-cyan-400 hover:text-cyan-200 text-left leading-none text-[0.65rem]"
              >
                ✏️ Name
              </button>
              <button
                onClick={m.startCamera}
                className="text-cyan-400 hover:text-cyan-200 text-left leading-none text-[0.65rem]"
              >
                🎥 Kamera
              </button>
              <label className="text-cyan-400 hover:text-cyan-200 text-left leading-none text-[0.65rem] cursor-pointer">
                Bild
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={m.uploadImage}
                />
              </label>
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
      <div className="flex-1 grid grid-cols-1 gap-2 p-2 overflow-hidden">
        {members.map((m, i) => (
          <div
            key={i}
            className="flex bg-black/60 rounded-lg border border-white/10 overflow-hidden"
            style={{
              minHeight: 0,
              height: `${innerMemberHeightPx}px`,
            }}
          >
            <div className="flex-1 bg-black">
              {m.image ? (
                <img
                  src={m.image}
                  alt={m.name}
                  className="w-full h-full object-cover bg-black"
                />
              ) : (
                <video
                  ref={m.videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover bg-black"
                ></video>
              )}
            </div>

            <div className="flex flex-col justify-between p-2 text-[0.6rem] w-[120px] text-white">
              <div className="truncate font-semibold leading-none max-w-[110px]">
                {m.name}
              </div>
              <button
                onClick={m.renamePlayer}
                className="text-cyan-400 hover:text-cyan-200 text-left leading-none"
              >
                ✏️ Name
              </button>
              <button
                onClick={m.startCamera}
                className="text-cyan-400 hover:text-cyan-200 text-left leading-none"
              >
                🎥 Kamera
              </button>
              <label className="text-cyan-400 hover:text-cyan-200 text-left leading-none cursor-pointer">
                Bild
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={m.uploadImage}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
