import React from "react";

const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  GF256_EXP[i] = x;
  GF256_EXP[i + 255] = x;
  GF256_LOG[x] = i;
  x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
}

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF256_EXP[GF256_LOG[a] + GF256_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF256_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], factor);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsCompute(data: Uint8Array, numEcc: number): Uint8Array {
  const gen = rsGeneratorPoly(numEcc);
  const res = new Uint8Array(numEcc);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.set(res.subarray(1));
    res[numEcc - 1] = 0;
    for (let j = 0; j < numEcc; j++) {
      res[j] ^= gfMul(gen[j], factor);
    }
  }
  return res;
}

export function generateQRCodeMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const len = bytes.length;
  
  const capacities = [17, 32, 53, 78, 106, 134, 154, 192];
  let version = 1;
  while (version <= capacities.length && len > capacities[version - 1]) {
    version++;
  }
  if (version > capacities.length) version = capacities.length;

  const totalCodewords = [26, 44, 70, 100, 134, 172, 196, 242][version - 1];
  const eccCodewords = [10, 16, 26, 36, 48, 64, 72, 88][version - 1];
  const dataCodewordsCount = totalCodewords - eccCodewords;

  const bits: number[] = [];
  const pushBits = (val: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(4, 4);
  pushBits(len, 8);
  for (let i = 0; i < len; i++) {
    pushBits(bytes[i], 8);
  }
  pushBits(0, Math.min(4, dataCodewordsCount * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const pad = [0xec, 0x11];
  let p = 0;
  while (bits.length < dataCodewordsCount * 8) {
    pushBits(pad[p++ % 2], 8);
  }

  const dataCodewords = new Uint8Array(dataCodewordsCount);
  for (let i = 0; i < dataCodewordsCount; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    dataCodewords[i] = b;
  }

  const ecc = rsCompute(dataCodewords, eccCodewords);
  const finalCodewords = new Uint8Array(totalCodewords);
  finalCodewords.set(dataCodewords);
  finalCodewords.set(ecc, dataCodewordsCount);

  const size = version * 4 + 17;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

  const placeFinder = (r: number, c: number) => {
    for (let i = -1; i <= 7; i++) {
      for (let j = -1; j <= 7; j++) {
        const row = r + i, col = c + j;
        if (row >= 0 && row < size && col >= 0 && col < size) {
          if (i === -1 || i === 7 || j === -1 || j === 7) matrix[row][col] = false;
          else if (i === 0 || i === 6 || j === 0 || j === 6) matrix[row][col] = true;
          else if (i >= 2 && i <= 4 && j >= 2 && j <= 4) matrix[row][col] = true;
          else matrix[row][col] = false;
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  matrix[size - 8][8] = true;

  if (version >= 2) {
    const alignPos = version === 2 ? [6, 18] : version === 3 ? [6, 22] : version === 4 ? [6, 26] : version === 5 ? [6, 30] : [6, 34];
    for (const r of alignPos) {
      for (const c of alignPos) {
        if (matrix[r][c] === null) {
          for (let i = -2; i <= 2; i++) {
            for (let j = -2; j <= 2; j++) {
              if (Math.abs(i) === 2 || Math.abs(j) === 2 || (i === 0 && j === 0)) {
                matrix[r + i][c + j] = true;
              } else {
                matrix[r + i][c + j] = false;
              }
            }
          }
        }
      }
    }
  }

  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = 0; i < 8; i++) {
    if (matrix[8][size - 1 - i] === null) matrix[8][size - 1 - i] = false;
    if (matrix[size - 1 - i][8] === null) matrix[size - 1 - i][8] = false;
  }

  let bitIdx = 0;
  const totalBits = totalCodewords * 8;
  const allBits: number[] = [];
  for (let i = 0; i < totalCodewords; i++) {
    for (let b = 7; b >= 0; b--) allBits.push((finalCodewords[i] >> b) & 1);
  }

  let dir = -1;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--;
    const rStart = dir === -1 ? size - 1 : 0;
    const rEnd = dir === -1 ? -1 : size;
    for (let r = rStart; r !== rEnd; r += (dir === -1 ? -1 : 1)) {
      for (let col = c; col >= c - 1; col--) {
        if (matrix[r][col] === null) {
          let b = bitIdx < totalBits ? allBits[bitIdx++] : 0;
          if ((r + col) % 2 === 0) b ^= 1;
          matrix[r][col] = b === 1;
        }
      }
    }
    dir = -dir;
  }

  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  const formatCoords = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = formatCoords[i];
    matrix[r][c] = formatBits[i] === 1;
  }

  const formatCoords2 = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = formatCoords2[i];
    matrix[r][c] = formatBits[i] === 1;
  }

  return matrix as boolean[][];
}

export function QRCodeSVG({
  value,
  size = 180,
  fgColor = "#ffffff",
  bgColor = "transparent",
  className = "",
}: {
  value: string;
  size?: number;
  fgColor?: string;
  bgColor?: string;
  className?: string;
}) {
  const matrix = generateQRCodeMatrix(value || "https://doppelganger.site");
  const n = matrix.length;
  const cellSize = size / (n + 2);

  let path = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        const x = (c + 1) * cellSize;
        const y = (r + 1) * cellSize;
        path += `M${x.toFixed(1)},${y.toFixed(1)}h${cellSize.toFixed(1)}v${cellSize.toFixed(1)}h-${cellSize.toFixed(1)}z `;
      }
    }
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      style={{ shapeRendering: "crispEdges", display: "inline-block" }}
    >
      {bgColor !== "transparent" && <rect width={size} height={size} fill={bgColor} rx={8} />}
      <path d={path} fill={fgColor} />
    </svg>
  );
}
