const { MAX_PLAYERS, MIN_PLAYERS, MAX_NUM } = require('./constants');
const { Player, Group, PlayerState, GroupState } = require('./models');
let { playerCnt, groupCnt, players, groups } = require('./data');
const { isTurn, isValidCard, gameFirst,
    gameBegin, gameEnd, roundBegin,
    roundEnd, turnAction, turnEnd } = require('./game');

const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 80 }, () => {
    console.log('서버 시작');
});


// 소켓에 플레이어가 연결된 경우
wss.on('connection', function(ws) {
    let pid = playerCnt++;
    console.log(pid + " connected");
    players.push(new Player(ws));

    sendGroupList(pid);

    // 유저로부터 메시지를 받은 경우
    // TODO: 유저로부터 온 메시지 validation (우선순위 낮음)
    ws.on('message', (msg) => {
        if (Buffer.isBuffer(msg)) {
            msg = msg.toString('utf8');
        }
        console.log(pid + ' : ' + msg);
        msg = JSON.parse(msg);

        if (msg.type == 'name') {
            setName(pid, msg.data);
        }
        else if (msg.type == 'enter') {
            enterGroup(pid, parseInt(msg.data));
        }
        else if (msg.type == 'exit') {
            exitGroup(pid);
        }
        else if (msg.type == 'newGroup') {
            let gid = groupCnt++;
            groups.push(new Group(msg.data));
            enterGroup(pid, gid);
        }
        else if (msg.type == 'notReady') {
            setReady(pid, false);
        }
        else if (msg.type == 'ready') {
            setReady(pid, true);

            // 모두 Ready 상태면 바로 시작
            let gid = players[pid].gid;
            if (canStart(gid)) {
                gameFirst(gid);
                gameBegin(gid);
                groups[gid].state = GroupState.REVOLUTION_WAIT;
            }
        }
        else if(msg.type == 'revolution') {
            gameRevolution(pid, gid, msg.data);
            groups[gid].state = GroupState.TAX_WAIT;
        }
        else if(msg.type == 'tax') {
            // TODO: 2명이 세금을 내면 게임 시작
            // gameTax(pid, gid, msg.data);
            groups[gid].state = GroupState.TURN_WAIT;
            roundBegin(gid, groups[gid].currentRank[0]);
        }
        else if (msg.type == 'card') {
            let cards = parseCard(msg.data);
            if (isTurn(pid)) {
                if (isValidCard(pid, cards)) {
                    turnAction(pid, cards);
                    turnEnd(pid);
                }
                else {
                    // TODO : 낼 수 없는 카드임을 알리는 함수 구현
                    // rejectCards(pid);
                }
            }
            // 차례가 아니면 그냥 무시
        }
    });
    ws.on('close', function(msg) {
        console.log(pid + ' disconnected');

        exitGroup(pid);
    });
});

// 서버 소켓이 기다리는 경우 로그 출력
wss.on('listening', () => {
   console.log('리스닝 ...');
});


function sendGroupList(pid) {
    sendMessage(pid, 'groupList', groups.toString());
}


function getMembers(gid) {
    let members = [];
    for (var pid of groups[gid].players) {
        members.push({
            name: players[pid].name,
            state: players[pid].state,
            cardCnt: players[pid].cards.length,
        })
    }
    return members;
}


function broadcastGroup(gid) {
    let groupInfo = {
        name: groups[gid].name,
        players: getMembers(gid),
    };
    broadcastMessage(gid, 'groupInfo', groupInfo);
}


function setName(pid, name) {
    players[pid].name = name;
    // sendMessage(pid, 'info', 'nameSet');
}


function enterGroup(pid, gid) {
    if (groups[gid].playerCnt >= MAX_PLAYERS || groups[gid].inGame) {
        sendMessage(pid, 'info', 'rejectEnter');
    }
    else {
        groups[gid].playerCnt++;
        groups[gid].players.push(pid);
        players[pid].state = PlayerState.NOTREADY;
        broadcastGroup(gid);
    }
}


function exitGroup(pid) {
    let gid = players[pid].gid;
    if (players[pid].state == PlayerState.IDLE || gid == -1)  {
        return;
    }

    players[pid].gid = -1;
    players[pid].state = PlayerState.IDLE;

    groups[gid].player = groups[gid].players.splice(groups[gid].players.indexOf(pid), 1);
    groups[gid].currentRank = groups[gid].currentRank.splice(groups[gid].currentRank.indexOf(pid), 1);
    groups[gid].nextRank = groups[gid].nextRank.splice(groups[gid].nextRank.indexOf(pid), 1);

    broadcastGroup(gid);
}


function setReady(pid, ready) {
    let gid = players[pid].gid;

    if (ready) {
        players[pid].state = PlayerState.READY;
    }
    else {
        players[pid].state = PlayerState.NOTREADY;
    }

    broadcastGroup(gid);
}


function canStart(gid) {
    if (groups[gid].playerCnt < MIN_PLAYERS || groups[gid].playerCnt > MAX_PLAYERS)
        return false;

    for (var pid of groups[gid].players) {
        if (players[pid].state != PlayerState.READY) {
            return false;
        }
    }
    return true;
}



// 소켓 메시지 생성자 - json 형식을 반환
function SocketMessage(type, data) {
    this.type = type;
    this.data = data;
}


function broadcastMessage(gid, type, data) {
    for (var pid of groups[gid].players) {
        sendMessage(pid, type, data);
    }
}

// id에 해당하는 유저에게 type, data를 json형식으로 보내는 함수
function sendMessage(id, type, data) {
    if (id == 0) return;
    players[id].ws.send(JSON.stringify(new SocketMessage(type, data)));
}

// function shoot(userId, opId, damage) {
//     users[opId].hp -= damage;
//     if (users[opId].hp <= 0) {
//         users[opId.hp] = 0;
//         sendMessage(opId, 'myHP', users[opId].hp);
//         sendMessage(userId, 'opHP', users[opId].hp);
//         endGame(opId, userId);
//     }
//     else {
//         sendMessage(opId, 'myHP', users[opId].hp);
//         sendMessage(userId, 'opHP', users[opId].hp);
//     }
// }

// // 웹 소켓이 연결된 경우 users에 넣을 유저 데이터 생성자
// function UserData(ws) {
//     this.ws = ws;
//     this.hp = 100;
//     this.position = (0, 0, 0);
//     this.rotation = (0, 0, 0);
//     this.opId = 0;
//     this.inGame = 0;
//     this.waiting = 0;
// }

// // 상대방에게 위치를 그대로 전달
// function sendPosition(opId, position) {
//     sendMessage(opId, 'position', position);
// }


// // shoot 후 상대방의 hp <= 0이 되면 게임이 끝났음을 알림
// function endGame(loser, winner) {
//     console.log('end game ' + loser + ' ' + winner);
//     sendMessage(loser, 'info', 'lose');
//     sendMessage(winner, 'info', 'win');
//     users[winner] = new UserData(users[winner].ws);
//     users[loser] = new UserData(users[loser].ws);
// }
