// File: server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');


const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let board = Array(9).fill(null);
let currentPlayer = 'x';
let gameOver = false;

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  if (Object.keys(players).length < 2) {
    const symbol = Object.values(players).includes('x') ? 'o' : 'x';
    players[socket.id] = symbol;
    socket.emit('player-assign', symbol);
    io.emit('board-update', { board, currentPlayer, gameOver });
  } else {
    socket.emit('full');
  }

  socket.on('make-move', (index) => {
    if (board[index] || gameOver) return;
    if (players[socket.id] !== currentPlayer) return;

    board[index] = currentPlayer;
    if (checkWin(currentPlayer)) {
      gameOver = true;
    } else if (board.every(cell => cell)) {
      gameOver = 'draw';
    } else {
      currentPlayer = currentPlayer === 'x' ? 'o' : 'x';
    }
    io.emit('board-update', { board, currentPlayer, gameOver });
  });

  socket.on('reset', () => {
    board = Array(9).fill(null);
    currentPlayer = 'x';
    gameOver = false;
    io.emit('board-update', { board, currentPlayer, gameOver });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    delete players[socket.id];
    board = Array(9).fill(null);
    currentPlayer = 'x';
    gameOver = false;
    io.emit('board-update', { board, currentPlayer, gameOver });
  });
});

function checkWin(player) {
  const winPatterns = [
    [0,1,2], [3,4,5], [6,7,8],
    [0,3,6], [1,4,7], [2,5,8],
    [0,4,8], [2,4,6]
  ];
  return winPatterns.some(pattern =>
    pattern.every(i => board[i] === player)
  );
}

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
