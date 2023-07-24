const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 80 }, () => {
    console.log('서버 시작');
});
// const wss = new WebSocket('ws://localhost:4000');

const MAX_PLAYERS = 8;
const MIN_PLAYERS = 4;
const MAX_NUM = 12;

// 유저 아이디 발급을 위한 카운트 변수
let groups = [];
let players = [];
let cards = [13, 13];

for (let i = 1; i <= MAX_NUM; ++i) {
    for (let j = 0; j < i; ++j) {
        cards.push(i);
    }
}

let cnt = 0;
// 웹 소켓이 연결된 경우 users에 넣을 유저 데이터 생성자
function Player(ws) {
    this.ws = ws;
    this.gid = -1;
    this.name = '';
    this.cards = [];
    this.cardCnt = 0;
    this.state = State.IDLE;
}

let groupId = 0;
// TODO: 2판 하면 종료되게끔 속성 추가
function Group(name) {
    this.name = name;
    this.players = [];
    this.playerCnt = 0;
    this.turn = -1;
    this.currentRank = [];
    this.nextRank = [];
    this.inGame = false;
    this.lastPid = -1;
    this.lastUsedCards = [];
}

const State = {
    IDLE: "그룹 선택 중",       // 그룹 입장 전
    NOTREADY: "준비 중",        // 그룹 입장 후
    READY: "준비 완료",         // 게임 대기 중 (다른 플레이어들 기다리는 중)
    PLAYING: "플레이 중",       // 게임 플레이 중, 라운드에 참여 중
    PASS: "패스",               // 라운드에서 패스를 외치고 다음 라운드를 대기 중
    DONE: "기다리는 중",        // 게임 끝나기를 기다리는 중, 카드를 전부 사용
};
Object.freeze(State);


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
    let playerId = cnt++;
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
            let gid = groupId++;
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

// 그룹 내에서 플레이어 차례인지 확인
function isTurn(pid) {
    let gid = players[pid].gid;
    return (groups[gid].turn == pid);
}

// 플레이어가 낼 수 있는 카드인지, 게임 진행 상황 상 알맞은 카드인지 확인
function isValidCard(pid, usedCards) {
    let gid = players[pid].gid;
    let inHandCards = players[pid].cards;

    // ------------------------------------------------------------
    // 플레이어의 핸드에 있는 카드인지 확인
    for(let i = 1; i <= 13; ++i) {
        let handCnts = inHandCards.filter((x) => x == i).length;
        let usedCnts = usedCards.filter((x) => x == i).length;
        if(handCnts < usedCnts) {
            return false;
        }
    }

    // ------------------------------------------------------------
    // 게임 진행 상황 상 알맞은 카드인지 확인

    // 조커를 가장 작은 값의 카드로 변환
    usedCards.sort((a, b) => a - b);
    usedCards = usedCards.map((x) => (x != 13 ? x : usedCards[0]));

    // 카드가 같은 종류인지 확인
    usedCards.sort((a, b) => a - b);
    if(usedCards[0] != usedCards[usedCards.length - 1]) {
        return false;
    }

    if(groups[gid].lastUsedCards.length != 0) {
        // 같은 개수인지 확인
        if(usedCards.length != groups[gid].lastUsedCards.length) {
            return false;
        }

        // 더 작은 값인지 확인
        if(usedCards[0] >= groupds[gid].lastUsedCards[0]) {
            return false;
        }
    }

    return true;
}

function gameFirst(gid) {
    // 처음 지위는 랜덤
    groups[gid].nextRank = groups[gid].players.slice();
    shuffle(groups[gid].nextRank);

    groups[gid].inGame = true;
}

function gameBegin(gid) {
    for(let pid of groups[gid].players) {
        players[pid].state = State.PLAYING;
    }

    // 이전 판 결과 바탕으로 이번 판 지위 설정
    groups[gid].currentRank = groups[gid].nextRank.slice();
    groups[gid].nextRank = [];

    // 카드 셔플 및 분배
    let splitCard = shuffleCards(groups[gid].playerCnt);
    groups[gid].players.forEach((pid, idx) => {
        players[pid].cards = splitCard[idx].slice();
    });

    // TODO: 혁명 입력 대기

    // TODO: 세금 입력 대기

}

function gameEnd(gid) {
    // TODO: DB에 전적 업데이트
}

function roundBegin(gid, startPid) {
    groups[gid].lastPid = -1;
    groups[gid].lastUsedCards = [];
    groups[gid].turn = startPid;
    for(let pid of groups[gid].players) {
        if(players[pid].state == State.PASS) {
            players[pid].state = State.PLAYING;
        }
    }
}

function roundEnd(gid) {
}

// 카드를 내거나 패스하는 행동 처리
function turnAction(pid, usedCards) {
    // 패스 처리
    if(usedCards.length == 0) {
        players[pid].state = State.PASS;
        return;
    }

    let gid = players[pid].gid;
    groups[gid].lastPid = pid;
    groups[gid].lastUsedCards = usedCards;

    for(let card of usedCards) {
        players[pid].cards.remove(card);
        players[pid].cardCnt -= 1;
    }
}

// 게임 종료, 라운드 종료, 다음 차례 결정
function turnEnd(pid) {
    let gid = players[pid].gid;

    // 방금 액션을 취한 플레이어가 카드를 전부 사용
    if(players[pid].cardCnt == 0) {
        players[pid].state = State.DONE;
        groups[gid].nextRank.push(pid);
        // broadcast?
    }

    // 게임 종료: 카드를 전부 사용하지 않은 플레이어가 1명
    let notDones = groups[gid].players.filter((pid) => players[pid].state != State.DONE);
    let notDoneCnt = notDones.length;
    if(notDoneCnt == 1) {
        let gameLastPid = notDones[0];
        groups[gid].nextRank.push(gameLastPid);
        gameEnd(gid);
        gameBegin(gid);
        return;
    }

    // 라운드 종료: 모든 유저가 패스
    let playings = groups[gid].players.filter((pid) => players[pid].state == State.PLAYING);
    let playingCnt = playings.length;
    if(playingCnt == 0) {
        let nextPid =
            players[groups[gid].lastPid].state != State.DONE
            ? groups[gid].lastPid
            : getNextPid(gid, groups[gid].lastPid);

        roundEnd(gid);
        roundBegin(gid, nextPid);
        return;
    }

    // 다음 차례 구하기
    groups[gid].turn = getNextPid(gid, groups[gid].turn);
}

function getNextPid(gid, lastPid) {
    let pidx = groups[gid].players.findIndex((pid) => pid == lastPid);
    do {
        pidx += 1;
        pidx %= groups[gid].playerCnt;
    } while(groups[gid].players[pidx].state == State.DONE);
    return groups[gid].players[pidx];
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
