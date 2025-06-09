const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let players = [];
let games = {};
let leaderboard = {};

// Load leaderboard from file or create new
function loadLeaderboard() {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const data = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
      leaderboard = JSON.parse(data);
    } else {
      leaderboard = {};
    }
  } catch (err) {
    console.error('Error loading leaderboard:', err);
    leaderboard = {};
  }
}

// Save leaderboard to file
function saveLeaderboard() {
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2));
}

loadLeaderboard();

function checkWin(board, symbol) {
  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const win of wins) {
    if (win.every(i => board[i] === symbol)) return win;
  }
  return null;
}

function checkDraw(board) {
  return board.every(cell => cell !== '');
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('newPlayer', (name) => {
    if (!leaderboard[name]) {
      leaderboard[name] = 0;
      saveLeaderboard();
    }
    players.push({
      id: socket.id,
      name,
      inGame: false,
      opponentId: null,
      symbol: '',
      wins: leaderboard[name]
    });
    updatePlayers();
  });

  socket.on('playGame', (opponentId) => {
    const player = players.find(p => p.id === socket.id);
    const opponent = players.find(p => p.id === opponentId);
    if (!player || !opponent) return;
    if (player.inGame || opponent.inGame) return;

    player.inGame = true;
    opponent.inGame = true;
    player.opponentId = opponentId;
    opponent.opponentId = socket.id;

    player.symbol = 'X';
    opponent.symbol = 'O';

    const gameId = [socket.id, opponentId].sort().join('#');
    games[gameId] = {
      players: [socket.id, opponentId],
      board: Array(9).fill(''),
      turn: 'X',
    };

    io.to(socket.id).emit('gameStart', {symbol: player.symbol, opponent: opponent.name});
    io.to(opponentId).emit('gameStart', {symbol: opponent.symbol, opponent: player.name});

    io.to(socket.id).emit('yourTurn');
    io.to(opponentId).emit('opponentTurn', player.name);

    updatePlayers();
  });

  socket.on('makeMove', (index) => {
    const player = players.find(p => p.id === socket.id);
    if (!player || !player.inGame) return;
    const opponent = players.find(p => p.id === player.opponentId);
    if (!opponent) return;

    const gameId = [socket.id, player.opponentId].sort().join('#');
    const game = games[gameId];
    if (!game) return;
    if (game.board[index] !== '') return;
    if (player.symbol !== game.turn) return;

    game.board[index] = player.symbol;
    io.to(game.players[0]).emit('moveMade', {index, symbol: player.symbol});
    io.to(game.players[1]).emit('moveMade', {index, symbol: player.symbol});

    const winningCells = checkWin(game.board, player.symbol);
    if (winningCells) {
      leaderboard[player.name] = (leaderboard[player.name] || 0) + 1;
      player.wins = leaderboard[player.name];
      saveLeaderboard();

      io.to(player.id).emit('gameEnd', {winner: player.symbol, winningCells});
      io.to(opponent.id).emit('gameEnd', {winner: player.symbol, winningCells});
      player.inGame = false;
      opponent.inGame = false;
      player.opponentId = null;
      opponent.opponentId = null;
      delete games[gameId];
      updatePlayers();
      return;
    }

    if (checkDraw(game.board)) {
      io.to(player.id).emit('gameEnd', {winner: 'draw', winningCells: []});
      io.to(opponent.id).emit('gameEnd', {winner: 'draw', winningCells: []});
      player.inGame = false;
      opponent.inGame = false;
      player.opponentId = null;
      opponent.opponentId = null;
      delete games[gameId];
      updatePlayers();
      return;
    }

    game.turn = game.turn === 'X' ? 'O' : 'X';

    io.to(player.id).emit('opponentTurn', opponent.name);
    io.to(opponent.id).emit('yourTurn');
  });

  socket.on('exitGame', () => {
    const player = players.find(p => p.id === socket.id);
    if (!player || !player.inGame) return;

    const opponent = players.find(p => p.id === player.opponentId);
    if (opponent) {
      io.to(opponent.id).emit('opponentLeft');
      opponent.inGame = false;
      opponent.opponentId = null;
      opponent.symbol = '';
    }

    player.inGame = false;
    player.opponentId = null;
    player.symbol = '';

    const gameId = [socket.id, player.opponentId].sort().join('#');
    if (games[gameId]) delete games[gameId];

    updatePlayers();
  });

  socket.on('disconnect', () => {
    const idx = players.findIndex(p => p.id === socket.id);
    if (idx !== -1) {
      const player = players[idx];
      if (player.inGame && player.opponentId) {
        const opponent = players.find(p => p.id === player.opponentId);
        if (opponent) {
          io.to(opponent.id).emit('opponentLeft');
          opponent.inGame = false;
          opponent.opponentId = null;
          opponent.symbol = '';
        }
      }
      players.splice(idx, 1);
      updatePlayers();
    }
    console.log('User disconnected:', socket.id);
  });

  socket.on('requestLeaderboard', () => {
    const sorted = Object.entries(leaderboard)
      .map(([name, wins]) => ({name, wins}))
      .sort((a,b) => b.wins - a.wins);
    socket.emit('leaderboardData', sorted);
  });

  function updatePlayers() {
    io.emit('updatePlayers', players.map(p => ({
      id: p.id,
      name: p.name,
      inGame: p.inGame,
      wins: leaderboard[p.name] || 0
    })));
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
