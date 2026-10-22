// --- 定数定義 ---
const HEX_SIZE = 25; 

const COLOR_GRASS = '#2ecc71';  // 草原 (緑)
const COLOR_WATER = '#3498db';  // 川や湖 (青)
const COLOR_FIELD = '#f1c40f';  // 畑 (黄色)
const COLOR_HOUSE = '#e74c3c';  // 家 (赤)
const COLOR_OBSTACLE = '#111111'; // お邪魔（＝駅） (黒)
const COLOR_RAILWAY = '#111111';  // 鉄道の辺 (駅と同じ色コードを使用)

const COLOR_POOL = [
    COLOR_GRASS, COLOR_GRASS, 
    COLOR_WATER, COLOR_FIELD, COLOR_HOUSE, COLOR_OBSTACLE
];

const RECOVER_AMOUNT = 3; // クエスト達成時の回復量（お好みで調整してください）
const HEX_DIRECTIONS = [
    {q: 1, r: 0}, {q: 0, r: 1}, {q: -1, r: 1},  
    {q: -1, r: 0}, {q: 0, r: -1}, {q: 1, r: -1}   
];

// --- ゲームクラス定義 ---
class HexGame {
    constructor(canvasId, nextCanvasId, uiElements) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.nextCanvas = document.getElementById(nextCanvasId);
        this.nextCtx = this.nextCanvas.getContext('2d');
        
        this.ui = uiElements;
        
        this.width = 0;
        this.height = 0;
        
        this.placedTiles = new Map();
        this.currentNextTile = null; 
        this.hoverHex = null;
        this.currentScore = 0;
        this.deckCount = 30; 
        this.isGameOver = false;
        this.historyStack = []; 
        
        // ★ クエスト難易度のパラメータ
        this.additionalQuestRequirement = 4; // 追加で繋ぐ必要のある数（最初は4）
        this.currentQuestProb = 5; 
        
        this.cameraOffset = { x: 0, y: 0 };
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.cameraStart = { x: 0, y: 0 };
        
        this.gameLoop = this.gameLoop.bind(this);
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.setupNewGame();
        
        this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
        this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
        this.canvas.addEventListener('pointerleave', () => this.onPointerLeave());
        
        this.nextCanvas.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); e.preventDefault();
            this.rotateNextTile();
        });
        
        this.ui.undoBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            this.undoMove();
        });
        
        this.ui.restartBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); e.preventDefault();
            this.setupNewGame();
        });
        
        requestAnimationFrame(this.gameLoop);
    }

    setupNewGame() {
        this.placedTiles.clear();
        this.historyStack = [];
        this.currentScore = 0;
        this.deckCount = 30;
        this.additionalQuestRequirement = 4; // リセット
        this.currentQuestProb = 5;
        this.isGameOver = false;
        
        this.cameraOffset = { x: 0, y: 0 };
        this.hoverHex = null;
        this.isDragging = false;
        
        this.placedTiles.set("0,0", {
            edges: this.generateNormalEdges(),
            questNumber: null,
            questColor: null,
            isQuestCompleted: false,
            isPerfectCompleted: false
        });
        
        this.currentNextTile = this.generateNextTileObj();
        
        this.ui.gameOverScreen.style.display = 'none';
        this.ui.undoBtn.style.display = 'none';
        
        this.updateUI();
        this.drawNextTile();
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    generateNormalEdges() {
        const c1 = COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)];
        const c2 = COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)];
        
        let edges = [];
        if (c1 === COLOR_OBSTACLE && c2 === COLOR_OBSTACLE) {
            edges = Array(6).fill(COLOR_OBSTACLE);
        } else if (c1 === c2 || c1 === COLOR_OBSTACLE || c2 === COLOR_OBSTACLE) {
            const realColor = (c1 === COLOR_OBSTACLE) ? c2 : c1;
            edges = Array(6).fill(realColor);
        } else {
            const ratio = Math.floor(Math.random() * 3) + 1; 
            for (let i = 0; i < 6; i++) {
                edges.push(i < ratio ? c1 : c2);
            }
            const rotateCount = Math.floor(Math.random() * 6);
            for (let i = 0; i < rotateCount; i++) {
                edges.unshift(edges.pop());
            }
        }
        return edges;
    }

    generateRandomEdges() {
        if (Math.random() < 0.2) {
            let edges = Array(6).fill(COLOR_GRASS);
            edges[0] = COLOR_RAILWAY;
            
            const railType = Math.floor(Math.random() * 3) + 1;
            edges[railType] = COLOR_RAILWAY; 
            
            const rotateCount = Math.floor(Math.random() * 6);
            for (let i = 0; i < rotateCount; i++) {
                edges.unshift(edges.pop());
            }
            return edges;
        }
        
        return this.generateNormalEdges();
    }

    generateNextTileObj() {
        return {
            edges: this.generateRandomEdges(),
            questNumber: null,
            questColor: null,
            isQuestCompleted: false,
            isPerfectCompleted: false
        };
    }

    rotateNextTile() {
        if (this.isGameOver || !this.currentNextTile) return; 
        const lastEdge = this.currentNextTile.edges.pop();
        this.currentNextTile.edges.unshift(lastEdge);
        this.drawNextTile();
    }

    saveState() {
        const state = {
            score: this.currentScore,
            deck: this.deckCount,
            additionalQuestRequirement: this.additionalQuestRequirement, 
            questProb: this.currentQuestProb,
            nextTile: JSON.parse(JSON.stringify(this.currentNextTile)),
            tiles: JSON.parse(JSON.stringify(Array.from(this.placedTiles.entries())))
        };
        this.historyStack.push(state);
        this.ui.undoBtn.style.display = 'block';
    }

    undoMove() {
        if (this.historyStack.length === 0) return;
        const prevState = this.historyStack.pop();
        
        this.currentScore = prevState.score;
        this.deckCount = prevState.deck;
        this.additionalQuestRequirement = prevState.additionalQuestRequirement; 
        this.currentQuestProb = prevState.questProb;
        this.currentNextTile = JSON.parse(JSON.stringify(prevState.nextTile));
        this.placedTiles = new Map(prevState.tiles);
        
        this.isGameOver = false;
        this.ui.gameOverScreen.style.display = 'none';
        this.updateUI();
        this.drawNextTile();
        
        if (this.historyStack.length === 0) {
            this.ui.undoBtn.style.display = 'none';
        }
    }

    hexToPixel(q, r) {
        const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
        const y = HEX_SIZE * 3 / 2 * r;
        return { x: x, y: y };
    }

    pixelToHex(screenX, screenY) {
        const nx = screenX - (this.width / 2 + this.cameraOffset.x);
        const ny = screenY - (this.height / 2 + this.cameraOffset.y);
        const q = (Math.sqrt(3) / 3 * nx - 1 / 3 * ny) / HEX_SIZE;
        const r = (2 / 3 * ny) / HEX_SIZE;
        return this.hexRound(q, r, -q - r);
    }

    hexRound(fq, fr, fs) {
        let q = Math.round(fq);
        let r = Math.round(fr);
        let s = Math.round(fs);
        const qDiff = Math.abs(q - fq);
        const rDiff = Math.abs(r - fr);
        const sDiff = Math.abs(s - fs);
        if (qDiff > rDiff && qDiff > sDiff) q = -r - s;
        else if (rDiff > sDiff) r = -q - s;
        return { q, r };
    }

    calculateMatches(q, r, tileEdges) {
        let matches = 0;
        for (let i = 0; i < 6; i++) {
            const dir = HEX_DIRECTIONS[i];
            const neighborKey = `${q + dir.q},${r + dir.r}`;
            if (this.placedTiles.has(neighborKey)) {
                const neighborData = this.placedTiles.get(neighborKey);
                const oppositeIndex = (i + 3) % 6;
                if (tileEdges[i] === neighborData.edges[oppositeIndex]) {
                    matches++;
                }
            }
        }
        return { matches };
    }

    canPlaceTile(q, r, tileEdges) {
        const key = `${q},${r}`;
        if (this.placedTiles.has(key)) return false; 
        
        let hasAdjacent = false;
        const myIsStation = tileEdges.every(e => e === COLOR_OBSTACLE);
        
        for (let i = 0; i < 6; i++) {
            const dir = HEX_DIRECTIONS[i];
            const neighborKey = `${q + dir.q},${r + dir.r}`;
            
            if (this.placedTiles.has(neighborKey)) {
                hasAdjacent = true;
                const neighborData = this.placedTiles.get(neighborKey);
                const oppositeIndex = (i + 3) % 6;
                
                const neighborIsStation = neighborData.edges.every(e => e === COLOR_OBSTACLE);
                const myIsRailwayEdge = !myIsStation && (tileEdges[i] === COLOR_RAILWAY);
                const neighborIsRailwayEdge = !neighborIsStation && (neighborData.edges[oppositeIndex] === COLOR_RAILWAY);
                
                if (myIsRailwayEdge && !(neighborIsRailwayEdge || neighborIsStation)) return false;
                if (neighborIsRailwayEdge && !(myIsRailwayEdge || myIsStation)) return false;
            }
        }
        return hasAdjacent;
    }

    hasEmptyNeighbor(q, r) {
        for (let i = 0; i < 6; i++) {
            const dir = HEX_DIRECTIONS[i];
            const neighborKey = `${q + dir.q},${r + dir.r}`;
            if (!this.placedTiles.has(neighborKey)) {
                return true; 
            }
        }
        return false;
    }

    checkPerfects(centerQ, centerR) {
        const targets = [{q: centerQ, r: centerR}];
        for (let i = 0; i < 6; i++) {
            targets.push({q: centerQ + HEX_DIRECTIONS[i].q, r: centerR + HEX_DIRECTIONS[i].r});
        }

        for (const t of targets) {
            const key = `${t.q},${t.r}`;
            if (!this.placedTiles.has(key)) continue;
            
            const data = this.placedTiles.get(key);
            if (data.isPerfectCompleted) continue; 
            
            let isPerfect = true;
            for (let i = 0; i < 6; i++) {
                const dir = HEX_DIRECTIONS[i];
                const neighborKey = `${t.q + dir.q},${t.r + dir.r}`;
                
                if (!this.placedTiles.has(neighborKey)) {
                    isPerfect = false; 
                    break;
                }
                
                const neighborData = this.placedTiles.get(neighborKey);
                const oppositeIndex = (i + 3) % 6;
                if (data.edges[i] !== neighborData.edges[oppositeIndex]) {
                    isPerfect = false; 
                    break;
                }
            }
            
            if (isPerfect) {
                data.isPerfectCompleted = true; 
                this.currentScore += 100;
                this.deckCount += 1; // ★ パーフェクト報酬を2から1に減少（実質プラマイゼロ）
                this.showFloatingText(t.q, t.r, "Perfect! +100pt / +1手札", "#f1c40f");
            }
        }
    }

    trySpawnQuestOnBoard() {
        const r = Math.random() * 100;
        if (r >= this.currentQuestProb) {
            this.currentQuestProb += 5;
            return;
        }
        
        let candidates = [];
        for (const [key, data] of this.placedTiles.entries()) {
            if (data.questNumber !== null) continue;
            
            const [q, hexR] = key.split(',').map(Number);
            if (!this.hasEmptyNeighbor(q, hexR)) continue;
            
            const validColors = [...new Set(data.edges)].filter(c => c !== COLOR_GRASS && c !== COLOR_OBSTACLE && c !== COLOR_RAILWAY);
            if (validColors.length > 0) {
                candidates.push({ key: key, data: data, validColors: validColors });
            }
        }
        
        if (candidates.length === 0) {
            this.currentQuestProb += 5;
            return;
        }
        
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        const chosenColor = picked.validColors[Math.floor(Math.random() * picked.validColors.length)];
        
        // ★ クエスト目標の決定ロジックを変更
        const [targetQ, targetR] = picked.key.split(',').map(Number);
        const currentConnected = this.countConnectedTiles(targetQ, targetR, chosenColor);
        
        // 目標値 ＝ 現在のその塊のサイズ ＋ 追加で必要な数
        picked.data.questNumber = currentConnected + Math.floor(this.additionalQuestRequirement);
        picked.data.questColor = chosenColor; 
        
        this.currentQuestProb = 5;
        // ★ クエストが発生するたびに、次回からの追加要求数が少しずつ増える（難易度インフレ）
        this.additionalQuestRequirement += 0.5;
    }

    countConnectedTiles(startQ, startR, targetColor) {
        const startKey = `${startQ},${startR}`;
        if (!this.placedTiles.has(startKey)) return 0;
        
        const startEdges = this.placedTiles.get(startKey).edges;
        if (!startEdges.includes(targetColor)) return 0;
        
        const visited = new Set();
        const queue = [ { q: startQ, r: startR } ];
        visited.add(startKey);
        let count = 0;
        
        while (queue.length > 0) {
            const current = queue.shift();
            const currentData = this.placedTiles.get(`${current.q},${current.r}`);
            
            if (currentData.edges.includes(targetColor)) {
                count++;
            }
            
            for (let i = 0; i < 6; i++) {
                if (currentData.edges[i] !== targetColor) continue;
                
                const dir = HEX_DIRECTIONS[i];
                const nextQ = current.q + dir.q;
                const nextR = current.r + dir.r;
                const nextKey = `${nextQ},${nextR}`;
                
                if (this.placedTiles.has(nextKey) && !visited.has(nextKey)) {
                    const nextData = this.placedTiles.get(nextKey);
                    const oppositeIndex = (i + 3) % 6;
                    if (nextData.edges[oppositeIndex] === targetColor) {
                        visited.add(nextKey);
                        queue.push({ q: nextQ, r: nextR });
                    }
                }
            }
        }
        return count;
    }

    checkQuests() {
        for (const [key, data] of this.placedTiles.entries()) {
            if (data.questNumber !== null && !data.isQuestCompleted) {
                const [q, r] = key.split(',').map(Number);
                const tileColor = data.questColor; 
                const connectedCount = this.countConnectedTiles(q, r, tileColor);
                
                if (connectedCount >= data.questNumber) {
                    data.isQuestCompleted = true;
                    
                    const bonusScore = data.questNumber * 20;
                    this.currentScore += bonusScore;
                    this.deckCount += RECOVER_AMOUNT;
                    
                    this.showFloatingText(q, r, `+${bonusScore}pt / +${RECOVER_AMOUNT}手札`, '#ffffff');
                }
            }
        }
    }

    showFloatingText(q, r, text, color = '#ffffff') {
        const pos = this.hexToPixel(q, r);
        const screenX = pos.x + this.width / 2 + this.cameraOffset.x;
        const screenY = pos.y + this.height / 2 + this.cameraOffset.y;
        
        const existingTexts = document.querySelectorAll('.floating-text');
        const offset = existingTexts.length * 25; 
        
        const div = document.createElement('div');
        div.className = 'floating-text';
        div.innerText = text;
        div.style.color = color;
        div.style.left = `${screenX - 40}px`; 
        div.style.top = `${screenY - 20 - offset}px`;
        document.body.appendChild(div);
        
        setTimeout(() => { document.body.removeChild(div); }, 1500);
    }

    onPointerDown(e) {
        if (this.isGameOver) return;
        this.isDragging = false;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.cameraStart = { x: this.cameraOffset.x, y: this.cameraOffset.y };
        this.canvas.setPointerCapture(e.pointerId); 
    }

    onPointerMove(e) {
        if (this.isGameOver) return;
        if (e.buttons > 0) { 
            const dx = e.clientX - this.dragStart.x;
            const dy = e.clientY - this.dragStart.y;
            
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                this.isDragging = true;
            }
            if (this.isDragging) {
                this.cameraOffset.x = this.cameraStart.x + dx;
                this.cameraOffset.y = this.cameraStart.y + dy;
            }
        }
        this.hoverHex = this.pixelToHex(e.clientX, e.clientY);
    }

    onPointerUp(e) {
        if (this.isGameOver) return;
        this.canvas.releasePointerCapture(e.pointerId);
        if (!this.isDragging) {
            this.handlePlacement();
        }
        this.isDragging = false;
    }

    onPointerLeave() {
        this.hoverHex = null;
        this.isDragging = false;
    }

    handlePlacement() {
        if (!this.hoverHex || this.isGameOver || !this.currentNextTile) return;
        
        if (this.canPlaceTile(this.hoverHex.q, this.hoverHex.r, this.currentNextTile.edges)) {
            this.saveState();
            this.deckCount--;
            
            const { matches } = this.calculateMatches(this.hoverHex.q, this.hoverHex.r, this.currentNextTile.edges);
            this.currentScore += matches * 10;
            
            let stationConnections = 0;
            const myIsStation = this.currentNextTile.edges.every(e => e === COLOR_OBSTACLE);
            
            for (let i = 0; i < 6; i++) {
                const dir = HEX_DIRECTIONS[i];
                const neighborKey = `${this.hoverHex.q + dir.q},${this.hoverHex.r + dir.r}`;
                
                if (this.placedTiles.has(neighborKey)) {
                    const neighborData = this.placedTiles.get(neighborKey);
                    const oppositeIndex = (i + 3) % 6;
                    
                    const neighborIsStation = neighborData.edges.every(e => e === COLOR_OBSTACLE);
                    const myIsRailwayEdge = !myIsStation && (this.currentNextTile.edges[i] === COLOR_RAILWAY);
                    const neighborIsRailwayEdge = !neighborIsStation && (neighborData.edges[oppositeIndex] === COLOR_RAILWAY);
                    
                    if ((myIsStation && neighborIsRailwayEdge) || (myIsRailwayEdge && neighborIsStation)) {
                        stationConnections++;
                    }
                }
            }
            
            if (stationConnections > 0) {
                const bonusScore = stationConnections * 50;
                const bonusDeck = stationConnections * 2; // 駅は手札回復の貴重な手段なので据え置き
                this.currentScore += bonusScore;
                this.deckCount += bonusDeck;
                this.showFloatingText(this.hoverHex.q, this.hoverHex.r, `Station! +${bonusScore}pt / +${bonusDeck}手札`, "#9b59b6");
            }
            
            const key = `${this.hoverHex.q},${this.hoverHex.r}`;
            this.placedTiles.set(key, JSON.parse(JSON.stringify(this.currentNextTile)));
            
            this.checkPerfects(this.hoverHex.q, this.hoverHex.r);
            this.trySpawnQuestOnBoard();
            this.checkQuests(); 
            this.updateUI();
            
            if (this.deckCount <= 0) {
                this.isGameOver = true;
                this.currentNextTile = null; 
                this.ui.undoBtn.style.display = 'none'; 
                
                setTimeout(() => {
                    this.ui.gameOverScreen.style.display = 'block';
                }, 500); 
                
            } else {
                this.currentNextTile = this.generateNextTileObj();
            }
            
            this.drawNextTile();
            this.hoverHex = null; 
        }
    }

    drawHex(context, x, y, size, tileObj, alpha = 1.0, isPreview = false, isPlaceable = false) {
        context.globalAlpha = alpha;
        const edges = tileObj.edges;
        
        const isStationTile = edges.every(e => e === COLOR_OBSTACLE);
        
        for (let i = 0; i < 6; i++) {
            if (isStationTile) {
                context.fillStyle = COLOR_OBSTACLE;
            } else {
                context.fillStyle = (edges[i] === COLOR_RAILWAY) ? COLOR_GRASS : edges[i];
            }
            
            context.beginPath();
            context.moveTo(x, y);
            const angle1 = (Math.PI / 3) * i - (Math.PI / 6);
            const angle2 = (Math.PI / 3) * (i + 1) - (Math.PI / 6);
            context.lineTo(x + size * Math.cos(angle1), y + size * Math.sin(angle1));
            context.lineTo(x + size * Math.cos(angle2), y + size * Math.sin(angle2));
            context.closePath();
            context.fill();
            
            if (isStationTile) {
                context.strokeStyle = 'rgba(255,255,255,0.1)';
            } else {
                context.strokeStyle = 'rgba(0,0,0,0.05)';
            }
            context.lineWidth = 1;
            context.stroke();
        }
        
        if (isStationTile) {
            context.fillStyle = '#ecf0f1'; 
            context.beginPath();
            context.arc(x, y, size * 0.45, 0, Math.PI * 2);
            context.fill();
            context.lineWidth = 2;
            context.strokeStyle = '#7f8c8d';
            context.stroke();
            
            context.fillStyle = '#e74c3c'; 
            context.beginPath();
            context.arc(x, y, size * 0.15, 0, Math.PI * 2);
            context.fill();
        }
        
        if (!isStationTile && edges.includes(COLOR_RAILWAY)) {
            let r1 = edges.indexOf(COLOR_RAILWAY);
            let r2 = edges.indexOf(COLOR_RAILWAY, r1 + 1);
            
            if (r1 !== -1 && r2 !== -1) {
                let a1 = (Math.PI / 3) * r1 - (Math.PI / 6);
                let a2 = (Math.PI / 3) * (r1 + 1) - (Math.PI / 6);
                let cx1 = x + (size * Math.cos(a1) + size * Math.cos(a2)) / 2;
                let cy1 = y + (size * Math.sin(a1) + size * Math.sin(a2)) / 2;
                
                let b1 = (Math.PI / 3) * r2 - (Math.PI / 6);
                let b2 = (Math.PI / 3) * (r2 + 1) - (Math.PI / 6);
                let cx2 = x + (size * Math.cos(b1) + size * Math.cos(b2)) / 2;
                let cy2 = y + (size * Math.sin(b1) + size * Math.sin(b2)) / 2;

                context.beginPath();
                context.moveTo(cx1, cy1);
                context.quadraticCurveTo(x, y, cx2, cy2);
                context.strokeStyle = COLOR_RAILWAY;
                context.lineCap = 'butt'; 
                context.lineWidth = size * 0.7; 
                context.stroke();

                context.beginPath();
                context.moveTo(cx1, cy1);
                context.quadraticCurveTo(x, y, cx2, cy2);
                context.strokeStyle = '#ecf0f1';
                context.lineWidth = size * 0.15;
                context.setLineDash([size * 0.3, size * 0.4]);
                context.stroke();
                context.setLineDash([]); 
            }
        }
        
        context.globalAlpha = 1.0;
        context.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - (Math.PI / 6);
            const px = x + size * Math.cos(angle);
            const py = y + size * Math.sin(angle);
            if (i === 0) context.moveTo(px, py);
            else context.lineTo(px, py);
        }
        context.closePath();
        
        if (isPreview) {
            context.strokeStyle = isPlaceable ? '#2ecc71' : '#e74c3c'; 
            context.lineWidth = 4;
        } else {
            context.strokeStyle = '#2c3e50';
            context.lineWidth = 2;
        }
        context.stroke();
        
        if (tileObj.questNumber !== null && !tileObj.isQuestCompleted) {
            context.fillStyle = tileObj.questColor;
            context.beginPath();
            context.arc(x, y, 12, 0, Math.PI * 2);
            context.fill();
            context.lineWidth = 1;
            context.strokeStyle = '#000';
            context.stroke();
            
            context.fillStyle = '#ffffff';
            context.font = 'bold 16px sans-serif';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.lineWidth = 3;
            context.strokeStyle = '#000000';
            context.strokeText(tileObj.questNumber, x, y);
            context.fillText(tileObj.questNumber, x, y);
        }
    }

    drawNextTile() {
        this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        if (!this.isGameOver && this.currentNextTile) {
            this.drawHex(this.nextCtx, this.nextCanvas.width / 2, this.nextCanvas.height / 2, 25, this.currentNextTile, 1.0, false, true);
        }
    }

    gameLoop() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        this.ctx.save();
        this.ctx.translate(this.width / 2 + this.cameraOffset.x, this.height / 2 + this.cameraOffset.y);
        
        for (const [key, data] of this.placedTiles.entries()) {
            const [q, r] = key.split(',').map(Number);
            const pos = this.hexToPixel(q, r);
            this.drawHex(this.ctx, pos.x, pos.y, HEX_SIZE, data, 1.0, false, false);
        }
        
        if (this.hoverHex && !this.isGameOver && this.currentNextTile) {
            const key = `${this.hoverHex.q},${this.hoverHex.r}`;
            if (!this.placedTiles.has(key)) {
                 const isPlaceable = this.canPlaceTile(this.hoverHex.q, this.hoverHex.r, this.currentNextTile.edges);
                 const pos = this.hexToPixel(this.hoverHex.q, this.hoverHex.r);
                 
                 this.drawHex(this.ctx, pos.x, pos.y, HEX_SIZE, this.currentNextTile, 0.5, true, isPlaceable);
            }
        }
        
        this.ctx.restore();
        requestAnimationFrame(this.gameLoop);
    }

    updateUI() {
        this.ui.scoreBoard.innerText = this.currentScore;
        this.ui.deckBoard.innerText = this.deckCount;
        this.ui.questProbText.innerText = `Quest Prob: ${this.currentQuestProb}%`;
    }
}
