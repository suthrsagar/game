const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve index.html only
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

let board = Array(9).fill(null);
let currentPlayer = "x";
let players = {};
let playerNames = {};

io.on("connection", (socket) => {
  socket.on("set-name", (name) => {
    if (Object.keys(players).length >= 2) {
      socket.emit("full");
      return socket.disconnect();
    }

    const playerSymbol = Object.values(players).includes("x") ? "o" : "x";
    players[socket.id] = playerSymbol;
    playerNames[playerSymbol] = name;

    // Inform current player
    socket.emit("player-assign", {
      symbol: playerSymbol,
      opponent: playerNames[playerSymbol === "x" ? "o" : "x"] || null,
    });

    // Inform opponent (if any)
    socket.broadcast.emit("opponent-name", name);

    io.emit("board-update", {
      board,
      currentPlayer,
      gameOver: checkGameOver(),
    });
  });

  socket.on("make-move", (index) => {
    if (board[index] === null && players[socket.id] === currentPlayer) {
      board[index] = currentPlayer;
      const gameOver = checkGameOver();
      currentPlayer = currentPlayer === "x" ? "o" : "x";
      io.emit("board-update", {
        board,
        currentPlayer,
        gameOver,
      });
    }
  });

  socket.on("reset", () => {
    board = Array(9).fill(null);
    currentPlayer = "x";
    io.emit("board-update", {
      board,
      currentPlayer,
      gameOver: null,
    });
  });

  socket.on("disconnect", () => {
    const symbol = players[socket.id];
    delete players[socket.id];
    delete playerNames[symbol];
    board = Array(9).fill(null);
    currentPlayer = "x";
    io.emit("board-update", {
      board,
      currentPlayer,
      gameOver: null,
    });
  });
});

function checkGameOver() {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (let [a, b, c] of winPatterns) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  if (board.every((cell) => cell !== null)) return "draw";
  return null;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
