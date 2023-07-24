const { Player, Group, State } = require('./models');
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 80 }, () => {
    console.log('서버 시작');
});
const { isTurn, isValidCard, gameFirst, gameBegin, gameEnd, roundBegin, roundEnd, turnAction, turnEnd, getNextPid } = require('./gameLogic');

const MAX_PLAYERS = 8;
const MIN_PLAYERS = 4;
const MAX_NUM = 12;

let groupCnt = 0;
let playerCnt = 0;

let groups = [];
let players = [];
let cards = [13, 13];

for (let i = 1; i <= MAX_NUM; ++i) {
    for (let j = 0; j < i; ++j) {
        cards.push(i);
    }
}


// groups.push(new Group([1, 2, 3, 4, 5, 6, 7, 8]))
// players.push(new Player(1))
// players.push(new Player(2))
// players.push(new Player(3))
// players.push(new Player(4))
// players.push(new Player(5))
// players.push(new Player(6))
// players.push(new Player(7))
// players.push(new Player(8))


// 소켓에 플레이어가 연결된 경우
wss.on('connection', function(ws) {
    // 유저 아이디 발급
    let playerId = playerCnt++;
    // 유저 목록에 유저 데이터 등록한다.
    console.log(playerId + " connected");
    players.push(new Player(ws));

    sendGroupList(playerId);

    // 유저로부터 메시지를 받은 경우
    ws.on('message', (msg) => {
        if (Buffer.isBuffer(msg)) {
            msg = msg.toString('utf8');
        }
        console.log(playerId + ' : ' + msg);
        msg = JSON.parse(msg);

        if (msg.type == 'name') {
            setName(playerId, msg.data);
        }
        else if (msg.type == 'enter') {
            enterGroup(playerId, int.Parse(msg.data));
        }
        else if (msg.type == 'exit') {
            exitGroup(playerId);
        }
        else if (msg.type == 'newGroup') {
            let gid = groupCnt++;
            groups.push(new Group(msg.data));
            enterGroup(playerId, gid);
        }
        else if (msg.type == 'ready') {
            setReady(playerId, true);

            // 모두 Ready 상태면 바로 시작
            let gid = players[playerId].gid;
            if (canStart(gid)) {
                gameFirst(gid);
                gameBegin(gid);
                // TODO: revoluction 처리
                // TODO: tax 처리
                roundBegin(gid, groups[gid].currentRank[0]);
            }
        }
        else if (msg.type == 'notReady') {
            setReady(playerId, false);
        }
        else if (msg.type == 'card') {
            let cards = parseCard(msg.data);
            if (isTurn(playerId)) {
                if (isValidCard(playerId, cards)) {
                    turnAction(playerId, cards);
                    turnEnd(playerId);
                }
                else {
                    // TODO : 낼 수 없는 카드임을 알리는 함수 구현
                    // rejectCards(playerId);
                }
            }
            // 차례가 아니면 그냥 무시
        }
    });
    ws.on('close', function(msg) {
        console.log(playerId + ' disconnected');

        exitGroup(playerId);
    });
});

// 서버 소켓이 기다리는 경우 로그 출력
wss.on('listening', () => {
   console.log('리스닝 ...');
});

function sendGroupList(playerId) {
    sendMessage(playerId, 'groupList', groups.toString());
}

function getMembers(gid) {
    let members = [];
    for (var pid of groups[gid].players) {
        members.push({
            name: players[pid].name,
            state: players[pid].state,
            cardCnt: players[pid].cards.length(),
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

function enterGroup(pid, gid) {
    if (groups[gid].playerCnt >= MAX_PLAYERS || groups[gid].inGame) {
        sendMessage(pid, 'info', 'rejectEnter');
    }
    else {
        groups[gid].playerCnt++;
        groups[gid].players.push(pid);
        players[pid].state = State.NOTREADY;
        broadcastGroup(gid);
    }
}

function exitGroup(pid) {
    let gid = players[pid].gid;
    if (players[pid].state == State.IDLE || gid == -1)  {
        return;
    }

    players[pid].gid = -1;
    players[pid].state = State.IDLE;

    groups[gid].player = groups[gid].players.splice(groups[gid].players.indexOf(pid), 1);
    groups[gid].currentRank = groups[gid].currentRank.splice(groups[gid].currentRank.indexOf(pid), 1);
    groups[gid].nextRank = groups[gid].nextRank.splice(groups[gid].nextRank.indexOf(pid), 1);

    broadcastGroup(gid);
}

function setReady(pid, ready) {
    let gid = players[pid].gid;

    if (ready) {
        players[pid].state = State.READY;
    }
    else {
        players[pid].state = State.NOTREADY;
    }

    broadcastGroup(gid);
}

function canStart(gid) {
    if (groups[gid].playerCnt < MIN_PLAYERS || groups[gid].playerCnt > MAX_PLAYERS)
        return false;

    for (var pid of groups[gid].players) {
        if (players[pid].state != State.READY) {
            return false;
        }
    }
    return true;
}


function shuffle(array) {
    array.sort(() => Math.random() - 0.5);
  }


function shuffleCards(num) {
    if (num < MIN_PLAYERS || num > MAX_PLAYERS) {
        return;
    }
    shuffle(cards);
    let res = [];
    for (let i = 0; i < num; ++i) {
        res.push([]);
    }
    for (let i = 0; i < cards.length(); ++i) {
        res[i % num].push(cards[i]);
    }
    return res;
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
