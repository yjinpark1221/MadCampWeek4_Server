const { Player, Group, State } = require('./models');
const { playerCnt, groupCnt, players, groups } = require('./data');
const { shuffle, shuffleCards } = require('./utils');


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


module.exports = {
	isTurn,
	isValidCard,
	gameFirst,
	gameBegin,
	gameEnd,
	roundBegin,
	roundEnd,
	turnAction,
	turnEnd,
};
