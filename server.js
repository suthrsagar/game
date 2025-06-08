// File: server.js

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 👉 Static folder serve karo
app.use(express.static(path.join(__dirname, 'public')));

// ✔️ Default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🧠 Game logic
let board = Array(9).fill(null);
let currentPlayer = 'x';
let players = {};
let connections = 0;

io.on('connection', (socket) => {
  if (connections >= 2) {
    socket.emit('full');
    socket.disconnect();
    return;
  }

  const playerSymbol = connections === 0 ? 'x' : 'o';
  players[socket.id] = playerSymbol;
  connections++;
  socket.emit('player-assign', playerSymbol);
  io.emit('board-update', {
    board,
    currentPlayer,
    gameOver: checkGameOver(),
  });

  socket.on('make-move', (index) => {
    if (board[index] === null && players[socket.id] === currentPlayer) {
      board[index] = currentPlayer;
      const gameOver = checkGameOver();
      currentPlayer = currentPlayer === 'x' ? 'o' : 'x';
      io.emit('board-update', {
        board,
        currentPlayer,
        gameOver,
      });
    }
  });

  socket.on('reset', () => {
    board = Array(9).fill(null);
    currentPlayer = 'x';
    io.emit('board-update', {
      board,
      currentPlayer,
      gameOver: null,
    });
  });

  socket.on('disconnect', () => {
    connections--;
    delete players[socket.id];
  });
});

function checkGameOver() {
  const winPatterns = [
    [0,1,2], [3,4,5], [6,7,8],
    [0,3,6], [1,4,7], [2,5,8],
    [0,4,8], [2,4,6],
  ];
  for (let pattern of winPatterns) {
    const [a,b,c] = pattern;
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a]; // 'x' or 'o'
    }
  }
  if (board.every(cell => cell !== null)) return 'draw';
  return null;
}

// 🚀 Port for Render.com or localhost
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
