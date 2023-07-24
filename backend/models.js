// 웹 소켓이 연결된 경우 users에 넣을 유저 데이터 생성자
class Player {
	constructor(ws) {
		this.ws = ws;
		this.gid = -1;
		this.name = '';
		this.cards = [];
		this.cardCnt = 0;
		this.state = State.IDLE;
	}
}

// TODO: 2판 하면 종료되게끔 속성 추가
class Group {
	constructor(name) {
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


module.exports = {
	Player,
	Group,
	State,
};
