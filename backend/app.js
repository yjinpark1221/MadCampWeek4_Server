
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session')
var cors = require("cors");
let {
  Player,
  game_state,
  Game,
  userNumber,
  roomsInfo,
} = require("./gameconfig");
const {
  Console
} = require("console");


const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');

const app = express();

app.use(session({
  secret: 'websession',
  resave : true,
  saveUninitialized : true

}))

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.get(`/room/:roomName`, cors(), (req, res, next) => {
  if (roomsInfo.rooms.open[req.params.roomName]) {
    res.render('room');
  } else next();
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

app.io = require('socket.io')();

app.io.on("connection", (socket) => {
  userNumber++;
  socket.userData = new Player("Guest" + userNumber, socket.id, "main room");

  // give update to a client only
  socket.join("waiting room");

  app.io.to("waiting room").emit(
    "refresh waiting room",
    socket.userData,
    roomsInfo.rooms.open,
    userNumber
  );

  console.log(
    "NEW:",
    socket.userData.nickname + " joined main room"
  );

  //! PLAYER SETTINGS

  socket.on("init", () => {
    socket.emit("update sender", socket.userData);
  });

  // Set nickname and check adding to room
  socket.on("set new nickname", (n_nickname, roomId) => {
    console.log(
      "UPDATE:",
      "Nickname change from " + socket.userData.nickname + " to " + n_nickname
    );
    socket.userData.nickname = n_nickname;

    // Check if player should be assosiacted to a room
    if (roomsInfo.rooms.open.hasOwnProperty(roomId)) {
      joinRoom(socket, roomsInfo.rooms, roomId);
    }

    socket.emit("update sender", socket.userData);
  });

  //! ROOMS FUNCTIONS

  // CREATE ROOM
  socket.on("create game room", (roomName, hide) => {
    roomsInfo.roomNumber++;
    let idRoom = `${roomsInfo.roomNumber}-${roomName}`;
    joinRoom(socket, roomsInfo.rooms, idRoom, hide); // Use helper to create and join room
    socket.emit("connectUrl", `/room/${idRoom}`);
  });

  // JOIN ROOM
  socket.on("join game room", (roomId) => {
    if (roomsInfo.rooms.open.hasOwnProperty(roomId)) {
      joinRoom(socket, roomsInfo.rooms, roomId);
      socket.emit("connectUrl", `/room/${roomId}`);
    } else {
      socket.emit("alert", "language.noRoom");
      app.io.to("waiting room").emit(
        "refresh waiting room",
        socket.userData,
        roomsInfo.rooms.open,
        userNumber
      );
      return;
    }
  });

  // SHOW MESSAGE
  socket.on("chat message", (msg) => {
    if (msg !== "") {
      app.io.to(socket.userData.cur_room).emit(
        "chat message",
        socket.userData.nickname,
        msg,
        socket.id
      );
    }
  });

  // CHECK USER READY
  socket.on("ready", () => {
    let roomName = socket.userData.cur_room;

    if(!roomsInfo.rooms.open.hasOwnProperty(roomName)) return;
    if (socket.userData.ready === true) {
      socket.userData.ready = false;
      roomsInfo.rooms.open[roomName].game.readyCount -= 1;
      syncUserToRoom(socket, roomsInfo.rooms.open);

      app.io.to(roomName).emit(
        "refresh game room",
        roomsInfo.rooms.open[roomName]
      );
      return;
    }

    // Ready only on Waiting room
    if (
      roomsInfo.rooms.open[roomName].game.state == game_state.WAITING &&
      socket.userData.ready === false
    ) {
      socket.userData.ready = true;
      roomsInfo.rooms.open[roomName].game.readyCount += 1;
      syncUserToRoom(socket, roomsInfo.rooms.open);

      // send out updated data
      app.io.to(roomName).emit(
        "refresh game room",
        roomsInfo.rooms.open[roomName]
      );

      // CHECK TO START GAME
      // Shared data, so use roomData not userData
      const userCnt = Object.keys(roomsInfo.rooms.open[roomName].sockets).length;
      if (
        userCnt >= 2 &&
        userCnt == roomsInfo.rooms.open[roomName].game.readyCount
      ) {
        //start game
        console.log("NEW:", roomName + ": game started");
        app.io.to(roomName).emit("chat announce", "language.started", "blue");

        // set order, shuffle, etc.
        roomsInfo.rooms.open[roomName].game.start(
          roomsInfo.rooms.open[roomName]
        );

        // distribute
        // TODO: 나머지 없게 만들기
        let handlim = Math.floor(
          80 / Object.keys(roomsInfo.rooms.open[roomName].sockets).length
        );
        let cnt = 0;
        for (const [sid, user] of Object.entries(roomsInfo.rooms.open[roomName].sockets)) {
          for (let i = cnt * handlim; i < handlim * cnt + handlim; i++) {
            user.hand.push(roomsInfo.rooms.open[roomName].game.deck[i]); // userData and room user Data not in sync
            user.pointsReceived = false; // Reset points condition
          }
          cnt += 1;
        }

        app.io.to("waiting room").emit(
          "refresh waiting room",
          socket.userData,
          roomsInfo.rooms.open,
          userNumber
        ); // notify start to main room

        app.io.to(roomName).emit(
          "refresh game room",
          roomsInfo.rooms.open[roomName]
        );

        app.io.to(roomName).emit("game start", "check revolution");
      }
    }
  });


  // revolution & tax
  socket.on("revolution", (isRevolution) => {
    console.log("revolution step");
    const sid = socket.userData.sid;
    const roomName = socket.userData.cur_room;

    let roomData = roomsInfo.rooms.open[roomName];
    let gameData = roomsInfo.rooms.open[roomName].game;
    gameData.revolutionList.push([sid, isRevolution]);
    console.log("roomData: ", JSON.stringify(roomData));

    let inGamePlayerCnt = 0;
    for(const [sid, userData] of Object.entries(roomsInfo.rooms.open[roomName].sockets)) {
      if(userData.ready) inGamePlayerCnt += 1;
    }

    if(inGamePlayerCnt != gameData.revolutionList.length) {
      return;
    }

    // all player submitted
    for(const [sid, isRevolution] of gameData.revolutionList) {
      if(!isRevolution) continue;
      gameData.taxSkip = true;

      const isBigRevolution =
        roomsInfo.rooms.open[roomName].sockets[sid].seat == inGamePlayerCnt - 1;
      console.log("big revolution: ", isBigRevolution);
      app.io.to(roomName).emit(
        "chat announce",
        isBigRevolution ? "language.bigRevolutionOccur" : "language.revolutionOccur",
        "blue",
        roomsInfo.rooms.open[roomName].sockets[sid].nickname
      );

      // 대혁명
      if(isBigRevolution) {
      for(let [sid, userData] of Object.entries(roomsInfo.rooms.open[roomName].sockets)) {
        roomData.sockets[sid].seat = inGamePlayerCnt - roomData.sockets[sid].seat - 1;
      }
      }
    }
    gameData.state = game_state.PLAYING;

    // --------------------------------------------------------
    // TAX 세금
    console.log(`tax step: isSkip: ${gameData.taxSkip}`);

    if(gameData.taxSkip) {
      app.io.to(roomName).emit(
        "chat announce",
        "language.taxSkip",
        "blue",
      );

      app.io.to("waiting room").emit(
        "refresh waiting room",
        socket.userData,
        roomsInfo.rooms.open,
        userNumber
      );
      app.io.to(roomName).emit(
        "refresh game room",
        roomsInfo.rooms.open[roomName]
      );
      // app.io.to(roomName).emit("game real start", "revolution & tax stage end");

      return;
    }

    // SWAP CARDS TAXS
    if(!gameData.taxSkip && roomsInfo.rooms.open[roomName].leaderBoard) {
      let leaderB = roomsInfo.rooms.open[roomName].leaderBoard;
      if (
        leaderB[0][3] === "greaterDalmuti" &&
        leaderB[leaderB.length - 1][3] === "greaterPeon"
      ) {
        // SORT FIRST
        roomsInfo.rooms.open[roomName].sockets[leaderB[0][2]].hand.sort((a, b) => a - b);
        roomsInfo.rooms.open[roomName].sockets[
          leaderB[leaderB.length - 1][2]
        ].hand.sort((a, b) => a - b);

        // TAKE CARTS
        let lastTwo =
          roomsInfo.rooms.open[roomName].sockets[
            leaderB[0][2]
          ].hand.splice(-2);
        let isJolly = lastTwo.findIndex((val) => {
          return val === 13;
        });
        if (isJolly !== -1) {
          roomsInfo.rooms.open[roomName].sockets[
            leaderB[0][2]
          ].hand.unshift(lastTwo.splice(isJolly, 1));
          roomsInfo.rooms.open[roomName].sockets[
            leaderB[0][2]
          ].hand.push(lastTwo[0]);
          lastTwo =
            roomsInfo.rooms.open[roomName].sockets[
              leaderB[0][2]
            ].hand.splice(-2);
        }
        isJolly = lastTwo.findIndex((val) => {
          return val === 13;
        });
        if (isJolly !== -1) {
          roomsInfo.rooms.open[roomName].sockets[
            leaderB[0][2]
          ].hand.unshift(lastTwo.splice(isJolly, 1));
          roomsInfo.rooms.open[roomName].sockets[
            leaderB[0][2]
          ].hand.push(lastTwo[0]);
          lastTwo =
            roomsInfo.rooms.open[roomName].sockets[
              leaderB[0][2]
            ].hand.splice(-2);
        }
        let firstTwo = roomsInfo.rooms.open[roomName].sockets[
          leaderB[leaderB.length - 1][2]
        ].hand.splice(0, 2);

        // SWAP CARDS
        roomsInfo.rooms.open[roomName].sockets[
          leaderB[leaderB.length - 1][2]
        ].hand.push(lastTwo[1]);
        roomsInfo.rooms.open[roomName].sockets[
          leaderB[leaderB.length - 1][2]
        ].hand.push(lastTwo[0]);
        roomsInfo.rooms.open[roomName].sockets[
          leaderB[0][2]
        ].hand.unshift(firstTwo[1]);
        roomsInfo.rooms.open[roomName].sockets[
          leaderB[0][2]
        ].hand.unshift(firstTwo[0]);

        // MESSAGE TO EVERYONE
        app.io.to(roomName).emit(
          "chat announce",
          "language.swap",
          "blue",
          roomsInfo.rooms.open[roomName].sockets[leaderB[0][2]].nickname,
          roomsInfo.rooms.open[roomName].sockets[
            leaderB[leaderB.length - 1][2]
          ].nickname
        );

        // MESSAGE TO USERS
        app.io.to(leaderB[0][2]).emit(
          "chat announce taxs",
          "language.taxs",
          "green",
          `${lastTwo[0]} & ${lastTwo[1]}`,
          `${firstTwo[0]} & ${firstTwo[1]}`
        );

        app.io.to(leaderB[leaderB.length - 1][2]).emit(
          "chat announce taxs",
          "language.taxs",
          "red",
          `${firstTwo[0]} & ${firstTwo[1]}`,
          `${lastTwo[0]} & ${lastTwo[1]}`
        );
      }
      if (
        leaderB[1][3] === "lesserDalmuti" &&
        leaderB[leaderB.length - 2][3] === "lesserPeon"
      ) {
        // SORT FIRST
        roomsInfo.rooms.open[roomName].sockets[leaderB[1][2]].hand.sort((a, b) => a - b);
        roomsInfo.rooms.open[roomName].sockets[
          leaderB[leaderB.length - 2][2]
        ].hand.sort((a, b) => a - b);

        // TAKE CARTS
        let lastOne =
          roomsInfo.rooms.open[roomName].sockets[
            leaderB[1][2]
          ].hand.splice(-1);
        let isJolly = lastOne.findIndex((val) => {
          return val === 13;
        });
        if (isJolly !== -1) {
          roomsInfo.rooms.open[roomName].sockets[
            leaderB[1][2]
          ].hand.unshift(lastOne.splice(isJolly, 1));
          lastOne =
            roomsInfo.rooms.open[roomName].sockets[
              leaderB[1][2]
            ].hand.splice(-1);
        }
        let firstOne = roomsInfo.rooms.open[roomName].sockets[
          leaderB[leaderB.length - 2][2]
        ].hand.splice(0, 1);

        // SWAP CARDS
        roomsInfo.rooms.open[roomName].sockets[
          leaderB[leaderB.length - 2][2]
        ].hand.push(lastOne[0]);
        roomsInfo.rooms.open[roomName].sockets[
          leaderB[1][2]
        ].hand.unshift(firstOne[0]);

        // MESSAGE TO EVERYONE
        app.io.to(roomName).emit(
          "chat announce",
          "language.swap",
          "blue",
          roomsInfo.rooms.open[roomName].sockets[leaderB[1][2]].nickname,
          roomsInfo.rooms.open[roomName].sockets[
            leaderB[leaderB.length - 2][2]
          ].nickname
        );

        // MESSAGE TO USERS
        app.io.to(leaderB[1][2]).emit(
          "chat announce taxs",
          "language.taxs",
          "green",
          `${lastOne[0]}`,
          `${firstOne[0]}`
        );

        app.io.to(leaderB[leaderB.length - 2][2]).emit(
          "chat announce taxs",
          "language.taxs",
          "red",
          `${firstOne[0]}`,
          `${lastOne[0]}`
        );
      }
    }

    app.io.to("waiting room").emit(
      "refresh waiting room",
      socket.userData,
      roomsInfo.rooms.open,
      userNumber
    );
    app.io.to(roomName).emit(
      "refresh game room",
      roomsInfo.rooms.open[roomName]
    );
    app.io.to(roomName).emit("game real start", "revolution & tax stage end");
  });

  socket.on("play", (selected_card) => {
    let roomName = socket.userData.cur_room;

    if (roomsInfo.rooms.open.hasOwnProperty(roomName)) {
      // but first of all, is it playing?
      if (roomsInfo.rooms.open[roomName].game.state != game_state.PLAYING) {
        socket.emit("alert", "language.cheat");
        return;
      }

      if (checkOrder(socket, roomsInfo.rooms.open[roomName])) {
        // delete 0 cards, this won't happen unless someone messed with client code
        for (const [card, val] of Object.entries(selected_card)) {
          if (val == 0) delete selected_card[card];
        }

        // check PASS
        if (Object.keys(selected_card).length == 0) {
          let tmp_idx = roomsInfo.rooms.open[roomName].game.cur_order_idx;
          roomsInfo.rooms.open[roomName].game.cur_order[tmp_idx] = 0; // pass
          // if this is last pass, erase last hand give prior to last player who played
          // also renew cur_order for next round
          // and update last hand. Last hand will be used to display cards on field
          let testLastPass =
            roomsInfo.rooms.open[roomName].game.nextPlayer(selected_card);

          app.io.to(roomName).emit(
            "chat announce",
            "language.passed",
            "black",
            socket.userData.nickname
          );

          app.io.to(roomName).emit(
            "refresh game room",
            roomsInfo.rooms.open[roomName],
            testLastPass
          );
        } else if (
          checkValidity(socket, roomsInfo.rooms.open[roomName], selected_card)
        ) {
          if (checkRule(roomsInfo.rooms.open[roomName], selected_card)) {
            // Everything seems fine.

            // update hand
            updateHand(socket, roomsInfo.rooms.open[roomName], selected_card);

            // Set all players as playing
            roomsInfo.rooms.open[roomName].game.cur_order.forEach((val, i) => {
              if (val === 0) roomsInfo.rooms.open[roomName].game.cur_order.splice(i,1,1)
            })

            //Winning condition
            if (
              roomsInfo.rooms.open[roomName].sockets[socket.id].hand.length ==
              0
            ) {
              // win due to empty hand
              roomsInfo.rooms.open[roomName].game.updateOrder(
                socket.userData.seat,
                roomName
              );

              // POINTS COUNTER
              let obj = roomsInfo.rooms.open[roomName].sockets;
              let leaderBoard = [];
              for (const player in obj) {
                if (
                  obj[player].hand.length === 0 &&
                  !obj[player].pointsReceived &&
                  obj[player].ready
                ) {
                  let points = 0;
                  roomsInfo.rooms.open[roomName].game.order.forEach(
                    (val) => {
                      if (val === true) points++;
                    }
                  );
                  obj[player].points = points;
                  obj[player].pointsReceived = true;
                  leaderBoard.push([
                    obj[player].points,
                    obj[player].nickname,
                    player,
                  ]);
                } else if (
                  (obj[player].hand.length > 0 &&
                    !obj[player].pointsReceived &&
                    !obj[player].points) ||
                  !obj[player].ready
                ) {
                  leaderBoard.push([0, obj[player].nickname, player]);
                } else {
                  leaderBoard.push([
                    obj[player].points,
                    obj[player].nickname,
                    player,
                  ]);
                }
              }
              console.log(leaderBoard);
              leaderBoard.sort((a, b) => b[0] - a[0]); // For descending sort
              for(let i = 0; i < leaderBoard.length; ++i) {
                const sid = leaderBoard[i][2];
                obj[sid].setOrder(i);
              }

              if (leaderBoard.length === 3) {
                leaderBoard[0].push("greaterDalmuti");
                leaderBoard[1].push("merchant");
                leaderBoard[2].push("greaterPeon");
              } else if (leaderBoard.length > 3 && leaderBoard.length <= 8) {
                leaderBoard.forEach((val, i) => {
                  if (i === 0) val.push("greaterDalmuti");
                  else if (i === 1) val.push("lesserDalmuti");
                  else if (leaderBoard.length - i === 2) val.push("lesserPeon");
                  else if (leaderBoard.length - i === 1) val.push("greaterPeon");
                  else val.push("merchant");
                });
              } else {
                leaderBoard[0].push("greaterDalmuti");
              }

              roomsInfo.rooms.open[roomName].leaderBoard = leaderBoard;

              app.io.to(roomName).emit(
                "chat announce",
                "language.finished",
                "green",
                socket.userData.nickname
              );

              if (roomsInfo.rooms.open[roomName].game.isOneLeft()) {
                app.io.to(roomName).emit("chat announce", "language.ended", "red");
                //end game
                roomsInfo.rooms.open[roomName].game.end();
                for (const [sid, userData] of Object.entries(
                    roomsInfo.rooms.open[roomName].sockets
                  )) {
                  userData.reset();
                }
              }
            }

            roomsInfo.rooms.open[roomName].game.nextPlayer(selected_card);
            // refresh
            app.io.to(roomName).emit(
              "refresh game room",
              roomsInfo.rooms.open[roomName],
              true,
              socket.userData
            );
          } else {
            // nope
            socket.emit("alert", "language.wrongCard");
          }
        } else {
          socket.emit("connectUrl", "/");
          socket.emit("alert", "language.roomFull");
        }
      } // check order
      else {
        socket.emit("alert", "language.waitTurn");
      }
    }
  });

  socket.on("disconnect", () => {
    userNumber--;
    console.log(
      "DISCONNECTED:",
      socket.userData.nickname + " disconnected from server"
    );

    if (roomsInfo.rooms.open.hasOwnProperty(socket.userData.cur_room)) {
      if (roomsInfo.rooms.open[socket.userData.cur_room].leaderBoard) {
        let index = 10
        roomsInfo.rooms.open[socket.userData.cur_room].leaderBoard.forEach((val, i) => {
          if (val[2] === socket.id) index = i
        })
        roomsInfo.rooms.open[socket.userData.cur_room].leaderBoard.splice(index, 1)
      }

      updateRoomDisconnect(
        socket,
        socket.userData.cur_room,
        roomsInfo.rooms.open
      );

      app.io.to("waiting room").emit(
        "refresh waiting room",
        socket.userData,
        roomsInfo.rooms.open,
        userNumber
      );
    }
  });
  //Game, broadcast only to same room
});

// ADD USER TO ROOM IN SERVER
function syncUserToRoom(socket, roomObj) {
  // Check if user isn't in waiting rooom and already in the room
  console.log("server: app.js syncUserToRoom 1055");
  if (
    socket.userData.cur_room != "waiting room" &&
    roomObj[socket.userData.cur_room]
  ) {
    console.log("server: app.js syncUserToRoom if in");
    if (!roomObj[socket.userData.cur_room].sockets) {
      roomObj[socket.userData.cur_room].sockets = {};
      roomObj[socket.userData.cur_room].sockets[socket.id] = socket.userData;
    } else {
      roomObj[socket.userData.cur_room].sockets[socket.id] = socket.userData;
    }
  }
  console.log("server: app.js syncUserToRoom 1068");
  // Add user to room in server
}

// DISCONNECT
function updateRoomDisconnect(socket, roomName, roomsObj) {
  socket.leave(roomName);
  socket.join("waiting room");

  // update room
  if (roomsObj[roomName]) {
    roomsObj[roomName].seats[socket.userData.seat] = false;
    delete roomsObj[roomName].sockets[socket.id]; // Delete player from room

    // undo ready if left with 'ready' before the game start
    if (socket.userData.ready) roomsObj[roomName].game.readyCount--;

    // user left during the game
    // omit from order list
    if (roomsObj[roomName].game.state == game_state.PLAYING) {
      roomsObj[roomName].game.updateOrder(socket.userData.seat);

      if (roomsObj[roomName].game.isOneLeft()) {
        app.io.to(roomName).emit("chat announce", "language.ended", "red");
        //end game
        roomsObj[roomName].game.end();
        for (const [sid, userData] of Object.entries(
            roomsObj[roomName].sockets
          )) {
          userData.reset();
        }
      }

      // pass or evaluate or refresh during game...? pass turn?
      if (roomsObj[roomName].game.cur_order_idx == socket.userData.seat) {
        // pass turn
        roomsObj[roomName].game.nextPlayer({});
      }
      app.io.to(roomName).emit("refresh game room", roomsObj[roomName]);
    }

    // Loop delete empty room exepct this
    for (const key in roomsObj) {
      if (Object.keys(roomsObj[key].sockets).length <= 0 && key !== roomName) {
        delete roomsObj[key];
      }
    }
  }

  // update/reset user
  socket.userData.reset();
  socket.userData.leaveRoom();

  app.io.to(roomName).emit("refresh game room", roomsObj[roomName]);
  app.io.to(roomName).emit("chat connection", socket.userData);
}

// JOIN THE ROOM
function joinRoom(socket, roomObj, roomName, hide) {
  // seat vacancy check
  socket.leave("waiting room");
  socket.join(roomName);
  console.log(socket.userData.nickname + " joined " + roomName);

  if (roomsInfo.rooms.open.hasOwnProperty(roomName)) {
    // Loop for free seats
    for (let i = 0; i < 8; i++) {
      if (!roomObj.open[roomName].seats[i]) {
        // is vacant
        roomObj.open[roomName].seats[i] = true;
        socket.userData.seat = i;
        break;
      }
    }

    // Check if room is full
    if (socket.userData.seat == -1) {
      //TODO full emit
      console.log("Room " + roomName + " is full");
      socket.leave(roomName);
      socket.join("waiting room");
      socket.emit(
        "refresh waiting room",
        socket.userData,
        roomsInfo.rooms.open,
        userNumber
      );
      socket.emit("connectUrl", "/");
      socket.emit("alert", "language.roomFull");
      return false;
    }

    // if there is no game object, give one
    if (!roomObj.open[roomName].game)
      roomObj.open[roomName].game = new Game();

    //update user
    socket.userData.cur_room = roomName;

    //update room data
    syncUserToRoom(socket, roomObj.open);

    //refresh list
    app.io.to("waiting room").emit(
      "refresh waiting room",
      socket.userData,
      roomsInfo.rooms.open,
      userNumber
    );

    app.io.to(roomName).emit("refresh game room", roomsInfo.rooms.open[roomName]); // send info about room
    app.io.to(roomName).emit("chat connection", socket.userData);

    socket.emit("update sender", socket.userData);
  } else {
    if (!roomObj.open[roomName] || !roomObj.open[roomName].seats) {
      roomObj.open[roomName] = {};
      roomObj.open[roomName].seats = new Array(8).fill(false);
    }

    // Loop for free seats
    for (let i = 0; i < 8; i++) {
      if (!roomObj.open[roomName].seats[i]) {
        // is vacant
        roomObj.open[roomName].seats[i] = true;
        socket.userData.seat = i;
        break;
      }
    }

    // Check if room is full
    if (socket.userData.seat == -1) {
      //TODO full emit
      console.log("room full");
      socket.leave(roomName);
      socket.join("waiting room");
      socket.emit(
        "refresh waiting room",
        socket.userData,
        roomsInfo.rooms.open,
        userNumber
      );

      socket.emit("connectUrl", "/");
      socket.emit("alert", "language.roomFull");
      return false;
    }

    // if there is no game object, give one
    if (!roomObj.open[roomName].game)
      roomObj.open[roomName].game = new Game();

    //update user
    socket.userData.cur_room = roomName;

    //update room data
    syncUserToRoom(socket, roomObj.open);

    //refresh list
    app.io.to("waiting room").emit(
      "refresh waiting room",
      socket.userData,
      roomsInfo.rooms.open,
      userNumber
    );

    app.io.to(roomName).emit("refresh game room", roomsInfo.rooms.open[roomName]); // send info about room
    app.io.to(roomName).emit("chat connection", socket.userData);

    socket.emit("update sender", socket.userData);
  }
}

function checkOrder(socket, roomData) {
  if (socket.userData.seat != roomData.sockets[socket.id].seat)
    // correctly in the room?
    return false; // illegal behavior detected

  if (roomData.game.cur_order_idx != socket.userData.seat)
    // check turn
    return false; // illegal behavior detected

  return true;
}

// check if selected cards are actually in hand
function checkValidity(socket, roomData, selected_card) {
  let sid = socket.id;
  let hand_map = {};
  for (let i = 0; i < roomData.sockets[sid].hand.length; i++) {
    let card = roomData.sockets[sid].hand[i];
    if (!hand_map[card]) hand_map[card] = 0;
    hand_map[card]++;
  }

  for (const [card, count] of Object.entries(selected_card)) {
    if (!hand_map[card])
      // selected card is not available in hand: illegal
      return false;
    else {
      //if there is, count should be equal to or less
      if (count > hand_map[card]) return false; // more is selected than what a user has: illega
    }
  }

  return true;
}

function checkRule(roomData, selected_card) {
  let count = 0;
  for (const [card, val] of Object.entries(selected_card)) {
    count += val;
  }

  // no more than two types of cards
  if (Object.keys(selected_card).length > 2) return false;
  // if there are, illegal
  else if (Object.keys(selected_card).length == 2 && !selected_card[13])
    // if there are two types of cards, one of them must be 13
    return false; //else illegal

  // last is merged as {num: no, count: count}
  if (roomData.game.last) {
    // card count should be the same
    if (roomData.game.last.count != count) return false; // else illegal

    //single card type which is normal, then 13 has no power
    if (Object.keys(selected_card).length == 1) {
      for (const [card, val] of Object.entries(selected_card)) {
        if (roomData.game.last.num - card <= 0) {
          // can't throw 13 alone
          return false; // if any of card no. is equal/greater than the last one, no go
        }
      }
    } else {
      // more than 1 card type
      // case with with 13
      // except 13, the card no. must be smaller
      for (const [card, val] of Object.entries(selected_card)) {
        if (card != 13 && roomData.game.last.num - card <= 0) {
          return false; // if any of card no. is equal/greater than the last one, no go
        }
      }
    }

    // if everything checks, then good to go
    return true;
  } else {
    // there is no previous play, or deleted due to winning a round
    return true;
  }
}

function updateHand(socket, roomData, selected_card) {
  let sid = socket.id;

  let hand_map = {};
  for (let i = 0; i < roomData.sockets[sid].hand.length; i++) {
    let card = roomData.sockets[sid].hand[i];
    if (!hand_map[card]) hand_map[card] = 0;
    hand_map[card]++;
  }

  for (const [card, count] of Object.entries(selected_card)) {
    hand_map[card] -= count;
  }
  // map to list
  let new_hand = [];
  for (const [card, count] of Object.entries(hand_map)) {
    let m = count;
    while (m-- > 0) new_hand.push(card);
  }
  roomData.sockets[sid].hand = new_hand;

  // if your hand is empty? you win
}

module.exports = app;
