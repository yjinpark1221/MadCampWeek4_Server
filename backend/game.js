const { Player, Group, PlayerState, GroupState } = require('./models');
const { players, groups } = require('./data');
const { shuffle, shuffleCards, isTurn, isInHands } = require('./utils');
const { JOKER } = require('./constants');


// 게임 진행 상황 상 알맞은 카드인지 확인
function isValidCard(pid, usedCards) {
    let gid = players[pid].gid;

    // ------------------------------------------------------------
    // 플레이어의 핸드에 있는 카드인지 확인
    if(!isInHands(pid, usedCards)) {
        return false;
    }

    // ------------------------------------------------------------
    // 게임 진행 상황 상 알맞은 카드인지 확인

    // 조커를 가장 작은 값의 카드로 변환
    usedCards.sort((a, b) => a - b);
    usedCards = usedCards.map((x) => (x != JOKER ? x : usedCards[0]));

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
    console.log('Game First');

    // 처음 지위는 랜덤
    groups[gid].nextRank = groups[gid].players.slice();
    shuffle(groups[gid].nextRank);

    groups[gid].inGame = true;
}


function gameBegin(gid) {
    console.log('Game Begin');

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
    console.log('Game End');

    // TODO: DB에 전적 업데이트
}


// 플레이어(pid)가 혁명을 외치는 것 처리
function gameRevolution(pid, gid, isRevolution) {
    console.log('Game Revolution');

    if(!isRevolution) {
        return;
    }

    // 대혁명
    if(pid == groups[gid].players[groups[gid].playerCnt - 1]) {
        groups[gid].currentRank.reverse();
    }

    // 세금 단계 건너뛰기
    groups[gid].state = GroupState.TURN_WAIT;
    roundBegin(gid, groups[gid].currentRank[0]);
}


// 플레이어(pid)가 줄 카드를
// TODO: validation
// 1. pidx <= 1
// 2. selectedCards.length == 2-pidx
// 3. 플레이어(pid) have selectedCards
function gameTax(pid, gid, selectedCards) {
    console.log('Game Tax');

    const pidx = getPlayerIdx(pid);
    const changeNum = 2 - pidx;

    const slavePid = groups[gid].currentRank[groups[gid].playerCnt-1 - pidx];
    players[slavePid].cards.sort((a, b) => a - b);
    const bestCards = players[slavePid].cards.slice(0, changeNum);

    // 카드 교환
    removeCards(pid, selectedCards);
    removeCards(slavePid, bestCards);
    players[pid].cards.push(...bestCards);
    players[slavePid].cards.push(...selectedCards);
}


function roundBegin(gid, startPid) {
    console.log('Round Begin');

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
    console.log('Round End');
}


// 카드를 내거나 패스하는 행동 처리
function turnAction(pid, usedCards) {
    console.log(`Turn Action: ${pid}, ${usedCards}`);

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
    console.log('Turn End');

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


// pid의 currentRank에서의 인덱스 구하기
function getPlayerIdx(pid) {
    let gid = players[pid].gid;
    let pidx = groups[gid].players.findIndex((x) => x == pid);
    return pidx;
}


// pid의 다음 차례 플레이어 구하기
function getNextPid(gid, lastPid) {
    let pidx = getPlayerIdx(lastPid);
    do {
        pidx += 1;
        pidx %= groups[gid].playerCnt;
    } while(groups[gid].players[pidx].state == State.DONE);
    return groups[gid].players[pidx];
}


// 플레이어(pid)의 손에서 cards를 제거
function removeCards(pid, cards) {
    for(let card of cards) {
        players[pid].cards.remove(card);
        players[pid].cardCnt -= 1;
    }
}


module.exports = {
	isTurn,
	isValidCard,
	gameFirst,
	gameBegin,
	gameEnd,
    gameRevolution,
    gameTax,
	roundBegin,
	roundEnd,
	turnAction,
	turnEnd,
};
