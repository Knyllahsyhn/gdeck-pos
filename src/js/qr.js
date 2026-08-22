/* ============================================================
   QR encoder, byte mode, error correction L, versions 1-25.
   Hand-rolled so the register needs no internet and no third
   party library. Verified against qrencode and zbar.
   ============================================================ */
const QR = (function(){
  "use strict";

  // Galois field GF(256), primitive polynomial 0x11D
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function(){
    let x = 1;
    for(let i=0;i<255;i++){ EXP[i]=x; LOG[x]=i; x<<=1; if(x & 0x100) x ^= 0x11D; }
    for(let i=255;i<512;i++) EXP[i] = EXP[i-255];
  })();
  const mul = (a,b) => (a===0||b===0) ? 0 : EXP[LOG[a]+LOG[b]];

  // Level L: [EC words per block, [[block count, data words], ...]]
  const EC_L = {
     1:[ 7,[[1, 19]]],              2:[10,[[1, 34]]],             3:[15,[[1, 55]]],
     4:[20,[[1, 80]]],              5:[26,[[1,108]]],             6:[18,[[2, 68]]],
     7:[20,[[2, 78]]],              8:[24,[[2, 97]]],             9:[30,[[2,116]]],
    10:[18,[[2, 68],[2, 69]]],     11:[20,[[4, 81]]],            12:[24,[[2, 92],[2, 93]]],
    13:[26,[[4,107]]],             14:[30,[[3,115],[1,116]]],    15:[22,[[5, 87],[1, 88]]],
    16:[24,[[5, 98],[1, 99]]],     17:[28,[[1,107],[5,108]]],    18:[30,[[5,120],[1,121]]],
    19:[28,[[3,113],[4,114]]],     20:[28,[[3,107],[5,108]]],    21:[28,[[4,116],[4,117]]],
    22:[28,[[2,111],[7,112]]],     23:[30,[[4,121],[5,122]]],    24:[30,[[6,117],[4,118]]],
    25:[26,[[8,106],[4,107]]]
  };
  const ALIGNMENT = {
     1:[],            2:[6,18],       3:[6,22],       4:[6,26],       5:[6,30],
     6:[6,34],        7:[6,22,38],    8:[6,24,42],    9:[6,26,46],   10:[6,28,50],
    11:[6,30,54],    12:[6,32,58],   13:[6,34,62],   14:[6,26,46,66],15:[6,26,48,70],
    16:[6,26,50,74], 17:[6,30,54,78],18:[6,30,56,82],19:[6,30,58,86],20:[6,34,62,90],
    21:[6,28,50,72,94], 22:[6,26,50,74,98], 23:[6,30,54,78,102],
    24:[6,28,54,80,106], 25:[6,32,58,84,110]
  };
  const MASKS = [
    (i,j)=>((i+j)%2)===0,
    (i,j)=>(i%2)===0,
    (i,j)=>(j%3)===0,
    (i,j)=>((i+j)%3)===0,
    (i,j)=>((Math.floor(i/2)+Math.floor(j/3))%2)===0,
    (i,j)=>(((i*j)%2)+((i*j)%3))===0,
    (i,j)=>((((i*j)%2)+((i*j)%3))%2)===0,
    (i,j)=>((((i+j)%2)+((i*j)%3))%2)===0
  ];

  function generatorPoly(n){
    let p = [1];
    for(let i=0;i<n;i++){
      const r = new Array(p.length+1).fill(0);
      for(let k=0;k<r.length;k++){
        let v = 0;
        if(k < p.length) v ^= p[k];
        if(k > 0)        v ^= mul(p[k-1], EXP[i]);
        r[k] = v;
      }
      p = r;
    }
    return p;
  }
  function ecWords(data, ecLen){
    const gen = generatorPoly(ecLen);
    const rem = new Uint8Array(ecLen);
    for(let d=0; d<data.length; d++){
      const factor = data[d] ^ rem[0];
      rem.copyWithin(0,1);
      rem[ecLen-1] = 0;
      if(factor !== 0) for(let i=0;i<ecLen;i++) rem[i] ^= mul(gen[i+1], factor);
    }
    return rem;
  }
  /* raw holds five bits: two for the error correction level, three for the
     mask. The reader needs the same code for every raw value, to pick the
     closest valid one out of a misread strip. */
  function formatCode(raw){
    let rem = raw << 10;
    for(let i=14;i>=10;i--) if((rem>>i)&1) rem ^= 0x537 << (i-10);
    return ((raw<<10) | rem) ^ 0x5412;
  }
  function formatBits(mask){ return formatCode((0b01 << 3) | mask); }   // level L = 01
  function versionBits(v){
    let rem = v << 12;
    for(let i=17;i>=12;i--) if((rem>>i)&1) rem ^= 0x1F25 << (i-12);
    return (v<<12) | rem;
  }
  function capacity(v){ return EC_L[v][1].reduce((s,[n,d])=>s+n*d, 0); }

  function limit(){ return capacity(25); }

  /* Everything that does not depend on the payload: finders, timing, the
     alignment patterns, the reserved strips for format and version. Encoder
     and reader share it, so neither can drift away from the other.
     fest marks a module as taken, mod holds its value. */
  function layout(version){
    const size = 17 + 4*version;
    const mod  = Array.from({length:size}, ()=>new Uint8Array(size));
    const fest = Array.from({length:size}, ()=>new Uint8Array(size));
    const place = (r,c,v) => {
      if(r<0||c<0||r>=size||c>=size) return;
      mod[r][c] = v; fest[r][c] = 1;
    };

    for(const [zr,zc] of [[0,0],[0,size-7],[size-7,0]]){
      for(let i=-1;i<=7;i++) for(let j=-1;j<=7;j++){
        const inside = i>=0 && i<=6 && j>=0 && j<=6;
        const dark = inside && (i===0||i===6||j===0||j===6||(i>=2&&i<=4&&j>=2&&j<=4));
        place(zr+i, zc+j, dark ? 1 : 0);
      }
    }
    for(let i=8;i<size-8;i++){
      place(6, i, i%2===0 ? 1 : 0);
      place(i, 6, i%2===0 ? 1 : 0);
    }
    const ap = ALIGNMENT[version];
    for(const r of ap) for(const c of ap){
      if((r<8&&c<8) || (r<8&&c>size-9) || (r>size-9&&c<8)) continue;
      for(let i=-2;i<=2;i++) for(let j=-2;j<=2;j++)
        place(r+i, c+j, Math.max(Math.abs(i),Math.abs(j))!==1 ? 1 : 0);
    }
    place(size-8, 8, 1);
    for(let i=0;i<9;i++){ if(i!==6){ fest[8][i]=1; fest[i][8]=1; } }
    for(let i=0;i<8;i++) fest[8][size-1-i] = 1;
    for(let i=0;i<7;i++) fest[size-1-i][8] = 1;
    if(version >= 7){
      const vb = versionBits(version);
      for(let i=0;i<18;i++){
        const bit = (vb>>i)&1;
        const a = Math.floor(i/3), b = i%3 + size - 11;
        place(a, b, bit); place(b, a, bit);
      }
    }
    return {size, mod, fest};
  }

  /* Walks the data area in the zigzag the standard prescribes, bottom right
     first, skipping everything fest marks. Encoder and reader hand it a
     different visit function and thereby agree on the order. */
  function walkData(size, fest, visit){
    let idx = 0, upward = true;
    for(let c=size-1; c>0; c-=2){
      if(c === 6) c--;                                // skip the timing column
      for(let n=0;n<size;n++){
        const r = upward ? size-1-n : n;
        for(let k=0;k<2;k++){
          const cc = c-k;
          if(fest[r][cc]) continue;
          visit(r, cc, idx++);
        }
      }
      upward = !upward;
    }
    return idx;
  }

  function matrix(text){
    const bytes = new TextEncoder().encode(text);

    let version = 0;
    for(let v=1;v<=25;v++){
      const countBits = v < 10 ? 8 : 16;
      if(4 + countBits + bytes.length*8 <= capacity(v)*8){ version = v; break; }
    }
    if(!version) throw new Error("Payload exceeds QR capacity");

    const bits = [];
    const pushBits = (val,len) => { for(let i=len-1;i>=0;i--) bits.push((val>>i)&1); };
    pushBits(4, 4);                                   // byte mode
    pushBits(bytes.length, version < 10 ? 8 : 16);
    for(const b of bytes) pushBits(b, 8);

    const capBits = capacity(version)*8;
    for(let i=0;i<4 && bits.length<capBits;i++) bits.push(0);
    while(bits.length % 8) bits.push(0);
    const padding = [0xEC, 0x11];
    let fi = 0;
    while(bits.length < capBits) pushBits(padding[fi++ % 2], 8);

    const words = new Uint8Array(capBits/8);
    for(let i=0;i<words.length;i++){
      let w = 0;
      for(let k=0;k<8;k++) w = (w<<1) | bits[i*8+k];
      words[i] = w;
    }

    const [ecLen, groups] = EC_L[version];
    const blocks = [];
    let pos = 0;
    for(const [count,len] of groups){
      for(let i=0;i<count;i++){ blocks.push(words.slice(pos,pos+len)); pos += len; }
    }
    const ecBlocks = blocks.map(b => ecWords(b, ecLen));

    const sequence = [];
    const maxLen = Math.max(...blocks.map(b=>b.length));
    for(let i=0;i<maxLen;i++) for(const b of blocks) if(i < b.length) sequence.push(b[i]);
    for(let i=0;i<ecLen;i++)  for(const b of ecBlocks) sequence.push(b[i]);

    const {size, mod, fest} = layout(version);

    const totalBits = sequence.length*8;
    walkData(size, fest, (r,c,i) => {
      mod[r][c] = i < totalBits ? (sequence[i>>3] >> (7-(i&7))) & 1 : 0;
    });

    let bestMask = 0, bestPenalty = Infinity, bestGrid = null;
    for(let m=0;m<8;m++){
      const candidate = mod.map((line,r) => {
        const masked = Uint8Array.from(line);
        for(let c=0;c<size;c++) if(!fest[r][c] && MASKS[m](r,c)) masked[c] ^= 1;
        return masked;
      });
      placeFormat(candidate, size, m);
      const s = penalty(candidate, size);
      if(s < bestPenalty){ bestPenalty = s; bestMask = m; bestGrid = candidate; }
    }
    return {matrix:bestGrid, size, version, mask:bestMask};
  }

  function placeFormat(grid, size, mask){
    const fb = formatBits(mask);
    const bit = i => (fb>>i)&1;
    // first copy: column 8 downward, then row 8 leftward
    for(let i=0;i<=5;i++)  grid[i][8] = bit(i);
    grid[7][8] = bit(6);
    grid[8][8] = bit(7);
    grid[8][7] = bit(8);
    for(let i=9;i<15;i++)  grid[8][14-i] = bit(i);
    // second copy: row 8 inward from the right, then column 8 downward
    for(let i=0;i<8;i++)   grid[8][size-1-i] = bit(i);
    for(let i=8;i<15;i++)  grid[size-15+i][8] = bit(i);
    grid[size-8][8] = 1;
  }

  function penalty(m, n){
    let s = 0;
    for(let i=0;i<n;i++){                             // rule 1: runs of five or more
      let lz=1, ls=1;
      for(let j=1;j<n;j++){
        lz = m[i][j]===m[i][j-1] ? lz+1 : 1;
        if(lz===5) s+=3; else if(lz>5) s+=1;
        ls = m[j][i]===m[j-1][i] ? ls+1 : 1;
        if(ls===5) s+=3; else if(ls>5) s+=1;
      }
    }
    for(let i=0;i<n-1;i++) for(let j=0;j<n-1;j++){    // rule 2: 2x2 blocks
      const v = m[i][j];
      if(v===m[i][j+1] && v===m[i+1][j] && v===m[i+1][j+1]) s += 3;
    }
    const a = [1,0,1,1,1,0,1,0,0,0,0], b = [0,0,0,0,1,0,1,1,1,0,1];
    const matches = (at,j) => {                      // rule 3: finder-like patterns
      let ja=true, jb=true;
      for(let k=0;k<11;k++){ const v=at(j+k); if(v!==a[k]) ja=false; if(v!==b[k]) jb=false; }
      return ja||jb;
    };
    for(let i=0;i<n;i++) for(let j=0;j+11<=n;j++){
      if(matches(k=>m[i][k], j)) s += 40;
      if(matches(k=>m[k][i], j)) s += 40;
    }
    let dark = 0;                                   // rule 4: proportion of dark modules
    for(let i=0;i<n;i++) for(let j=0;j<n;j++) dark += m[i][j];
    s += Math.floor(Math.abs(dark*100/(n*n)-50)/5)*10;
    return s;
  }

  /* ============================================================
     READING
     A camera frame arrives as grey values. The way back out: threshold it,
     find the three big squares, work out where the grid sits, sample it,
     undo mask and interleaving, repair what the picture got wrong.
     ============================================================ */

  /* ---------- Reed-Solomon, the repairing half ---------- */
  /* Inside here a polynomial is indexed by its degree, coefficient of x^k at
     position k. The encoder stores them the other way round; the conversion
     happens at the door, once, instead of in every loop. */
  const inv = a => EXP[255 - LOG[a]];
  const evalLow = (p,x) => { let v = 0; for(let i=p.length-1;i>=0;i--) v = mul(v,x) ^ p[i]; return v; };
  const alphaPow = k => EXP[((k % 255) + 255) % 255];

  function rsDecode(block, ecLen){
    const n = block.length;
    const r = new Array(n);
    for(let k=0;k<n;k++) r[k] = block[n-1-k];

    const synd = new Array(ecLen);
    let broken = false;
    for(let i=0;i<ecLen;i++){
      synd[i] = evalLow(r, alphaPow(i));
      if(synd[i]) broken = true;
    }
    if(!broken) return block;

    // Berlekamp-Massey. No sign flips: in this field minus is plus.
    let sigma = [1], prev = [1], L = 0, shift = 1, delta = 1;
    for(let i=0;i<ecLen;i++){
      let d = synd[i];
      for(let j=1;j<=L;j++) d ^= mul(sigma[j] || 0, synd[i-j]);
      if(d === 0){ shift++; continue; }
      const before = sigma.slice();
      const scale = mul(d, inv(delta));
      for(let j=0;j<prev.length;j++){
        const at = j + shift;
        while(sigma.length <= at) sigma.push(0);
        sigma[at] ^= mul(scale, prev[j]);
      }
      if(2*L <= i){ L = i+1-L; prev = before; delta = d; shift = 1; }
      else shift++;
    }
    if(L > ecLen/2) return null;                    // more damage than level L can carry

    // Chien search: every zero of sigma points at one broken byte.
    const spots = [];
    for(let k=0;k<n;k++) if(evalLow(sigma, alphaPow(-k)) === 0) spots.push(k);
    if(spots.length !== L) return null;

    // Omega = S * sigma, cut off above the syndrome count.
    const omega = new Array(ecLen).fill(0);
    for(let i=0;i<ecLen;i++) for(let j=0;j<sigma.length && i+j<ecLen;j++)
      omega[i+j] ^= mul(synd[i], sigma[j]);

    // Formal derivative: in this field only the odd powers survive.
    const dsigma = [];
    for(let i=1;i<sigma.length;i+=2) dsigma[i-1] = sigma[i];
    for(let i=0;i<dsigma.length;i++) if(dsigma[i] === undefined) dsigma[i] = 0;

    const fixed = r.slice();
    for(const k of spots){
      const xInv = alphaPow(-k);
      const bottom = evalLow(dsigma, xInv);
      if(bottom === 0) return null;
      fixed[k] ^= mul(mul(alphaPow(k), evalLow(omega, xInv)), inv(bottom));
    }

    const out = new Uint8Array(n);
    for(let k=0;k<n;k++) out[k] = fixed[n-1-k];
    // Trust nothing: the repaired block has to satisfy the syndromes now.
    const check = new Array(n);
    for(let k=0;k<n;k++) check[k] = out[n-1-k];
    for(let i=0;i<ecLen;i++) if(evalLow(check, alphaPow(i)) !== 0) return null;
    return out;
  }

  /* ---------- From picture to black and white ---------- */
  /* One threshold for the whole picture loses half the code as soon as a lamp
     stands on one side. So every block gets its own, smoothed over its
     neighbours, and a block without any contrast borrows their verdict. */
  function binarize(grey, width, height){
    const B = 8;
    const bw = Math.max(1, (width + B - 1) >> 3), bh = Math.max(1, (height + B - 1) >> 3);
    const point = new Float32Array(bw*bh);
    for(let by=0; by<bh; by++) for(let bx=0; bx<bw; bx++){
      let sum = 0, count = 0, min = 255, max = 0;
      const yEnd = Math.min(height, (by+1)*B), xEnd = Math.min(width, (bx+1)*B);
      for(let y=by*B; y<yEnd; y++){
        const row = y*width;
        for(let x=bx*B; x<xEnd; x++){
          const v = grey[row+x];
          sum += v; count++;
          if(v < min) min = v;
          if(v > max) max = v;
        }
      }
      let t = count ? sum/count : 128;
      if(max - min <= 24){
        t = min/2;
        if(by > 0 && bx > 0){
          const around = (point[(by-1)*bw+bx] + 2*point[by*bw+bx-1] + point[(by-1)*bw+bx-1]) / 4;
          if(min < around) t = around;
        }
      }
      point[by*bw+bx] = t;
    }

    const bits = new Uint8Array(width*height);
    for(let by=0; by<bh; by++) for(let bx=0; bx<bw; bx++){
      let sum = 0, count = 0;
      for(let dy=-2; dy<=2; dy++) for(let dx=-2; dx<=2; dx++){
        const yy = by+dy, xx = bx+dx;
        if(yy<0||xx<0||yy>=bh||xx>=bw) continue;
        sum += point[yy*bw+xx]; count++;
      }
      const t = sum/count;
      const yEnd = Math.min(height, (by+1)*B), xEnd = Math.min(width, (bx+1)*B);
      for(let y=by*B; y<yEnd; y++){
        const row = y*width;
        for(let x=bx*B; x<xEnd; x++) bits[row+x] = grey[row+x] < t ? 1 : 0;
      }
    }
    return bits;
  }

  /* ---------- Finding the three squares ---------- */
  /* A line through a finder always crosses dark, light, dark, light, dark in
     the widths 1:1:3:1:1. That ratio is what we hunt for, first across every
     row, then down the column of each hit to confirm it. */
  function runs(read, length){
    const out = [];
    let start = 0, colour = read(0);
    for(let i=1;i<length;i++){
      const v = read(i);
      if(v !== colour){ out.push({colour, start, len:i-start}); colour = v; start = i; }
    }
    out.push({colour, start, len:length-start});
    return out;
  }

  function ratioFits(a,b,c,d,e){
    const total = a+b+c+d+e;
    if(total < 7) return 0;
    const unit = total/7, tol = unit/2;
    if(Math.abs(unit-a) >= tol || Math.abs(unit-b) >= tol ||
       Math.abs(3*unit-c) >= 3*tol || Math.abs(unit-d) >= tol || Math.abs(unit-e) >= tol) return 0;
    return unit;
  }

  /* Confirms a hit along one axis and hands back the exact middle. */
  function crossCheck(read, length, near, unit){
    const span = Math.ceil(unit*5);
    const from = Math.max(0, near-span), to = Math.min(length, near+span);
    if(to-from < 7) return null;
    const list = runs(i => read(from+i), to-from);
    for(let i=0;i+4<list.length;i++){
      if(!list[i].colour) continue;
      const [p,q,r,s,t] = list.slice(i,i+5);
      const u = ratioFits(p.len,q.len,r.len,s.len,t.len);
      if(!u) continue;
      const middle = from + r.start + r.len/2;
      if(Math.abs(middle - near) > unit*2) continue;
      return {middle, unit:u};
    }
    return null;
  }

  function findFinders(bits, width, height){
    const hits = [];
    const rowStep = Math.max(1, Math.floor(height/240));
    for(let y=0; y<height; y+=rowStep){
      const row = y*width;
      const list = runs(x => bits[row+x], width);
      for(let i=0;i+4<list.length;i++){
        if(!list[i].colour) continue;
        const [p,q,r,s,t] = list.slice(i,i+5);
        const unit = ratioFits(p.len,q.len,r.len,s.len,t.len);
        if(!unit || unit < 1) continue;
        const cx = r.start + r.len/2;
        const down = crossCheck(v => bits[v*width + Math.round(cx)], height, y, unit);
        if(!down) continue;
        const cy = down.middle;
        const across = crossCheck(v => bits[Math.round(cy)*width + v], width, Math.round(cx), down.unit);
        if(!across) continue;
        hits.push({x:across.middle, y:cy, unit:(down.unit+across.unit)/2});
      }
    }

    // Every finder is met many times over. Fold the hits together.
    const groups = [];
    for(const h of hits){
      let joined = false;
      for(const g of groups){
        if(Math.abs(g.x-h.x) < g.unit && Math.abs(g.y-h.y) < g.unit && Math.abs(g.unit-h.unit) < g.unit/2 + 1){
          g.x = (g.x*g.n + h.x)/(g.n+1);
          g.y = (g.y*g.n + h.y)/(g.n+1);
          g.unit = (g.unit*g.n + h.unit)/(g.n+1);
          g.n++; joined = true; break;
        }
      }
      if(!joined) groups.push({x:h.x, y:h.y, unit:h.unit, n:1});
    }
    return groups.filter(g => g.n >= 2).sort((a,b)=>b.n-a.n).slice(0, 12);
  }

  /* Out of all candidates pick the triple that looks most like the corners of
     a square: same module size, two equal sides, a right angle between them. */
  function pickTriple(list){
    if(list.length < 3) return null;
    let best = null;
    const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
    for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++) for(let k=j+1;k<list.length;k++){
      const three = [list[i], list[j], list[k]];
      const units = three.map(p=>p.unit);
      const spread = Math.max(...units)/Math.min(...units);
      if(spread > 1.7) continue;
      const sides = [[0,1],[1,2],[2,0]].map(([a,b])=>dist(three[a],three[b]));
      const longest = Math.max(...sides);
      const others = sides.filter(s=>s!==longest);
      if(others.some(s=>s < longest/4)) continue;
      // Right isosceles: the two short sides equal, the long one their diagonal.
      const wrongLegs = Math.abs(others[0]-others[1])/longest;
      const wrongAngle = Math.abs(longest - Math.hypot(others[0], others[1]))/longest;
      const score = wrongLegs + wrongAngle + (spread-1)/4;
      if(!best || score < best.score) best = {score, three};
    }
    return best && best.score < 0.5 ? best.three : null;
  }

  /* Names the three: which one sits in the corner, and which way round the
     other two go. Getting the handedness wrong reads the code mirrored. */
  function orient(three){
    const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
    const sides = [[0,1,2],[1,2,0],[2,0,1]];
    let corner = 0, longest = -1;
    for(const [a,b,c] of sides){
      const d = dist(three[a], three[b]);
      if(d > longest){ longest = d; corner = c; }
    }
    const topLeft = three[corner];
    const rest = three.filter((_,i)=>i!==corner);
    const u = {x:rest[0].x-topLeft.x, y:rest[0].y-topLeft.y};
    const v = {x:rest[1].x-topLeft.x, y:rest[1].y-topLeft.y};
    const cross = u.x*v.y - u.y*v.x;
    return cross > 0
      ? {topLeft, topRight:rest[0], bottomLeft:rest[1]}
      : {topLeft, topRight:rest[1], bottomLeft:rest[0]};
  }

  /* The small square near the bottom right corner. It is what makes a photo
     taken at an angle readable, because it pins down the fourth corner. */
  /* An alignment pattern is a dark ring, a light ring, a dark middle, each one
     module wide, so a cut through its centre gives five runs. Only the inner
     three may be measured: the outer ring sits against data modules and merges
     with every one of them that happens to be dark. Measuring all five was
     what kept the pattern from ever being found. */
  function alignAt(list, i, unit){
    const [p,q,r,s,t] = list.slice(i, i+5);
    if(!p.colour) return 0;                       // runs alternate, so this fixes the rest
    const tol = unit/2;
    if(Math.abs(q.len-unit) >= tol || Math.abs(r.len-unit) >= tol || Math.abs(s.len-unit) >= tol) return 0;
    if(p.len < unit/2 || t.len < unit/2) return 0;
    return (q.len + r.len + s.len)/3;
  }

  /* Confirms a candidate down the column the way crossCheck does for finders,
     only against the shape of an alignment pattern. */
  function alignCheck(read, length, near, unit){
    const span = Math.ceil(unit*5);
    const from = Math.max(0, near-span), to = Math.min(length, near+span);
    if(to-from < 5) return null;
    const list = runs(i => read(from+i), to-from);
    for(let i=0;i+4<list.length;i++){
      const u = alignAt(list, i, unit);
      if(!u) continue;
      const middle = from + list[i+2].start + list[i+2].len/2;
      if(Math.abs(middle - near) > unit*2) continue;
      return {middle, unit:u};
    }
    return null;
  }

  /* Searches in rings around the estimate. The estimate assumes the code lies
     flat; the further it is tipped, the further the pattern has wandered, and
     a picture taken over a table is always tipped a little. Widening only on
     failure keeps the usual case cheap and the far case possible. */
  function findAlignment(bits, width, height, atX, atY, unit){
    for(const modules of [5, 9, 14]){
      const hit = alignmentWithin(bits, width, height, atX, atY, unit, modules);
      if(hit) return hit;
    }
    return null;
  }

  function alignmentWithin(bits, width, height, atX, atY, unit, modules){
    const reach = Math.ceil(unit*modules);
    const x0 = Math.max(0, Math.round(atX-reach)), x1 = Math.min(width, Math.round(atX+reach));
    const y0 = Math.max(0, Math.round(atY-reach)), y1 = Math.min(height, Math.round(atY+reach));
    if(x1-x0 < 5 || y1-y0 < 5) return null;
    let best = null;
    for(let y=y0; y<y1; y++){
      const row = y*width;
      const list = runs(i => bits[row + x0 + i], x1-x0);
      for(let i=0;i+4<list.length;i++){
        const u = alignAt(list, i, unit);
        if(!u) continue;
        // The dark middle is the third run. Taking the light ring instead put
        // the column one module off, and the check below then never matched.
        const cx = x0 + list[i+2].start + list[i+2].len/2;
        const down = alignCheck(v => bits[v*width + Math.round(cx)], height, y, unit);
        if(!down) continue;
        const cy = down.middle;
        const off = Math.hypot(cx-atX, cy-atY);
        if(!best || off < best.off) best = {x:cx, y:cy, off};
      }
    }
    return best;
  }

  /* ---------- Straightening ---------- */
  /* Eight numbers that map the unit square onto any four-cornered shape, so a
     picture taken from the side can still be sampled square. */
  function squareToQuad(x0,y0,x1,y1,x2,y2,x3,y3){
    const dx3 = x0-x1+x2-x3, dy3 = y0-y1+y2-y3;
    if(dx3 === 0 && dy3 === 0){
      return [x1-x0, x2-x1, x0, y1-y0, y2-y1, y0, 0, 0, 1];
    }
    const dx1 = x1-x2, dx2 = x3-x2, dy1 = y1-y2, dy2 = y3-y2;
    const den = dx1*dy2 - dx2*dy1;
    if(den === 0) return null;
    const a13 = (dx3*dy2 - dx2*dy3)/den;
    const a23 = (dx1*dy3 - dx3*dy1)/den;
    return [x1-x0+a13*x1, x3-x0+a23*x3, x0,
            y1-y0+a13*y1, y3-y0+a23*y3, y0,
            a13, a23, 1];
  }
  function adjoint(m){
    const [a11,a21,a31,a12,a22,a32,a13,a23,a33] = m;
    return [a22*a33-a23*a32, a23*a31-a21*a33, a21*a32-a22*a31,
            a13*a32-a12*a33, a11*a33-a13*a31, a12*a31-a11*a32,
            a12*a23-a13*a22, a13*a21-a11*a23, a11*a22-a12*a21];
  }
  function compose(a,b){
    const [a11,a21,a31,a12,a22,a32,a13,a23,a33] = a;
    const [b11,b21,b31,b12,b22,b32,b13,b23,b33] = b;
    return [
      a11*b11+a12*b21+a13*b31, a21*b11+a22*b21+a23*b31, a31*b11+a32*b21+a33*b31,
      a11*b12+a12*b22+a13*b32, a21*b12+a22*b22+a23*b32, a31*b12+a32*b22+a33*b32,
      a11*b13+a12*b23+a13*b33, a21*b13+a22*b23+a23*b33, a31*b13+a32*b23+a33*b33
    ];
  }
  function mapPoint(m,x,y){
    const [a11,a21,a31,a12,a22,a32,a13,a23,a33] = m;
    const w = a13*x + a23*y + a33;
    return [(a11*x + a21*y + a31)/w, (a12*x + a22*y + a32)/w];
  }
  function gridToImage(src, dst){
    const toSquare = adjoint(squareToQuad(...src));
    const toQuad = squareToQuad(...dst);
    return (toSquare && toQuad) ? compose(toSquare, toQuad) : null;
  }

  /* ---------- Reading the sampled grid ---------- */
  function readFormat(grid, size){
    const copies = [[], []];
    for(let i=0;i<=5;i++) copies[0][i] = grid[i][8];
    copies[0][6] = grid[7][8];
    copies[0][7] = grid[8][8];
    copies[0][8] = grid[8][7];
    for(let i=9;i<15;i++) copies[0][i] = grid[8][14-i];
    for(let i=0;i<8;i++)  copies[1][i] = grid[8][size-1-i];
    for(let i=8;i<15;i++) copies[1][i] = grid[size-15+i][8];

    let best = null;
    for(const bitsRead of copies){
      let value = 0;
      for(let i=0;i<15;i++) value |= (bitsRead[i] & 1) << i;
      for(let raw=0; raw<32; raw++){
        let diff = value ^ formatCode(raw), off = 0;
        while(diff){ off += diff & 1; diff >>= 1; }
        if(!best || off < best.off) best = {off, raw};
      }
    }
    if(!best || best.off > 3) return null;
    return {level:(best.raw>>3)&3, mask:best.raw&7};
  }

  function readWords(grid, version, mask){
    const {size, fest} = layout(version);
    const [ecLen, groups] = EC_L[version];
    const lengths = [];
    for(const [count,len] of groups) for(let i=0;i<count;i++) lengths.push(len);
    const total = lengths.reduce((s,l)=>s+l+ecLen, 0);

    const words = new Uint8Array(total);
    walkData(size, fest, (r,c,i) => {
      if(i >= total*8) return;
      const bit = grid[r][c] ^ (MASKS[mask](r,c) ? 1 : 0);
      if(bit) words[i>>3] |= 0x80 >> (i&7);
    });

    // Undo the interleaving, then repair each block on its own.
    const longest = Math.max(...lengths);
    const blocks = lengths.map(len => new Uint8Array(len + ecLen));
    let at = 0;
    for(let i=0;i<longest;i++) for(let b=0;b<lengths.length;b++)
      if(i < lengths[b]) blocks[b][i] = words[at++];
    for(let i=0;i<ecLen;i++) for(let b=0;b<lengths.length;b++)
      blocks[b][lengths[b]+i] = words[at++];

    const out = [];
    for(let b=0;b<blocks.length;b++){
      const fixed = rsDecode(blocks[b], ecLen);
      if(!fixed) return null;
      for(let i=0;i<lengths[b];i++) out.push(fixed[i]);
    }
    return out;
  }

  function wordsToText(words, version){
    let at = 0;
    const take = n => {
      let v = 0;
      for(let i=0;i<n;i++){
        const bit = at < words.length*8 ? (words[at>>3] >> (7-(at&7))) & 1 : 0;
        v = (v<<1) | bit; at++;
      }
      return v;
    };
    const mode = take(4);
    if(mode !== 4) return null;                     // we only ever write byte mode
    const count = take(version < 10 ? 8 : 16);
    if(count > words.length) return null;
    const bytes = new Uint8Array(count);
    for(let i=0;i<count;i++) bytes[i] = take(8);
    try{ return new TextDecoder("utf-8", {fatal:true}).decode(bytes); }
    catch(e){ return null; }
  }

  /* Samples the grid for one assumed size and tries to make sense of it. */
  /* How far a single attempt got. The scan window shows the furthest stage
     any attempt reached, which is the difference between "the code is not in
     the picture" and "the picture is too poor to get the data out of it". */
  const STAGE = {sampled:2, format:3, level:4, words:5, text:6};

  function attempt(bits, width, height, marks, dim, alignment, reach){
    if(dim < 21 || dim > 117 || (dim-17) % 4 !== 0) return null;
    const version = (dim-17)/4;
    const {topLeft, topRight, bottomLeft} = marks;

    const src = alignment
      ? [3.5,3.5, dim-3.5,3.5, dim-6.5,dim-6.5, 3.5,dim-3.5]
      : [3.5,3.5, dim-3.5,3.5, dim-3.5,dim-3.5, 3.5,dim-3.5];
    const corner = alignment || {
      x: topRight.x - topLeft.x + bottomLeft.x,
      y: topRight.y - topLeft.y + bottomLeft.y
    };
    const dst = [topLeft.x,topLeft.y, topRight.x,topRight.y,
                 corner.x,corner.y, bottomLeft.x,bottomLeft.y];
    const m = gridToImage(src, dst);
    if(!m) return null;

    const grid = Array.from({length:dim}, ()=>new Uint8Array(dim));
    for(let r=0;r<dim;r++) for(let c=0;c<dim;c++){
      const [x,y] = mapPoint(m, c+0.5, r+0.5);
      const xi = Math.round(x), yi = Math.round(y);
      if(xi<0||yi<0||xi>=width||yi>=height) return null;
      grid[r][c] = bits[yi*width+xi];
    }

    reach(STAGE.sampled);

    const format = readFormat(grid, dim);
    if(!format) return null;
    reach(STAGE.format);
    if(format.level !== 1) return null;             // level L is what the register writes
    reach(STAGE.level);
    const words = readWords(grid, version, format.mask);
    if(!words) return null;
    reach(STAGE.words);
    const text = wordsToText(words, version);
    if(text !== null) reach(STAGE.text);
    return text;
  }

  /* The whole way, from a grey picture to the text inside it.
     Returns null whenever anything does not add up, never a guess. */
  function read(grey, width, height, notes){
    const note = (k,v) => { if(notes) notes[k] = v; };
    // Every entry is written on every call. A stale true from some earlier
    // frame would tell the operator the code is in view when it is not.
    note("corners", 0); note("square", false); note("unit", 0); note("stage", 0);
    let far = 0;
    const reach = level => { if(level > far){ far = level; note("stage", far); } };
    if(!grey || width < 21 || height < 21) return null;
    const bits = binarize(grey, width, height);
    const candidates = findFinders(bits, width, height);
    note("corners", candidates.length);
    const three = pickTriple(candidates);
    if(!three) return null;
    note("square", true);
    reach(1);
    const marks = orient(three);
    const {topLeft, topRight, bottomLeft} = marks;

    const unit = (topLeft.unit + topRight.unit + bottomLeft.unit)/3;
    note("unit", unit);
    if(unit < 1) return null;
    const across = Math.hypot(topRight.x-topLeft.x, topRight.y-topLeft.y);
    const down   = Math.hypot(bottomLeft.x-topLeft.x, bottomLeft.y-topLeft.y);
    const guess  = Math.round((across+down)/2/unit) + 7;

    // Snap to a legal size, then also try one step either way: the module
    // size taken from the finders can be off by a hair on a blurred picture.
    const base = 21 + 4*Math.round((guess-21)/4);
    for(const dim of [base, base+4, base-4, base+8, base-8]){
      if(dim < 21 || dim > 117) continue;
      let alignment = null;
      if(dim > 21){
        const pull = 1 - 3/(dim-7);
        const estX = topLeft.x + pull*(topRight.x - topLeft.x + bottomLeft.x - topLeft.x);
        const estY = topLeft.y + pull*(topRight.y - topLeft.y + bottomLeft.y - topLeft.y);
        alignment = findAlignment(bits, width, height, estX, estY, unit);
      }
      const text = attempt(bits, width, height, marks, dim, alignment, reach);
      if(text !== null) return text;
      if(alignment){
        const plain = attempt(bits, width, height, marks, dim, null, reach);
        if(plain !== null) return plain;
      }
    }
    return null;
  }

  return {matrix, limit, read};
})();
