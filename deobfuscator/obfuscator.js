'use strict';
/**
 * Obfuscator engine: clean Lua/Luau source -> WeAreDevs-style obfuscated output.
 * Architecture (mirrors what the deobfuscator expects):
 *   - outer IIFE wrapper:  return (function(...) ... end)(...)
 *   - encoded string pool U (Base-85 encoded string literals)
 *   - runtime pool permutation via unrolled  U[a],U[b]=U[b],U[a]  swaps
 *   - custom Base-85 dictionary (85 symbols) + Base-64 dictionary (64 symbols)
 *   - string decoder D/DE (5 chars -> 4 bytes, 256-power extraction)
 *   - index obfuscation helper S(x) = U[x + K]
 *   - register loader R(x) = Z[x]
 *   - arithmetic camouflage on constants
 *   - state-based VM dispatcher (control-flow flattening) around payload closure
 */

// --- Base-85 alphabet (85 printable symbols) -------------------------------
const B85_ALPHABET = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '!', '#', '$', '%', '&', '(', ')', '*', '+', '-', ';', '<', '=',
  '>', '?', '@', '^', '_', '`', '{', '|', '}', '~',
];

// --- Base-64 alphabet (secondary dictionary) -------------------------------
const B64_ALPHABET = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '!', '?',
];

/** Base-85 encode: 4 bytes -> 5 chars. */
function encode85Chunk(bytes4) {
  let v = ((bytes4[0] * 256 + bytes4[1]) * 256 + bytes4[2]) * 256 + bytes4[3];
  let out = '';
  for (let i = 0; i < 5; i++) {
    out = B85_ALPHABET[v % 85] + out;
    v = Math.floor(v / 85);
  }
  return out;
}

/** Base-85 encode with short-block support (like Ascii85):
 *  4 bytes -> 5 chars, 3 -> 4, 2 -> 3, 1 -> 2. No padding bytes emitted. */
function encode85(bytes) {
  let out = '';
  let i = 0;
  for (; i + 4 <= bytes.length; i += 4) {
    out += encode85Chunk(bytes.slice(i, i + 4));
  }
  const rem = bytes.length - i;
  if (rem > 0) {
    const chunk = bytes.slice(i);
    while (chunk.length < 4) chunk.push(0);
    const full = encode85Chunk(chunk); // 5 chars for the zero-padded value
    out += full.slice(0, rem + 1); // keep only rem+1 chars
  }
  return out;
}

function utf8Bytes(str) {
  return Array.from(Buffer.from(String(str), 'utf8'));
}

// --- Lua string literal escaping -------------------------------------------
function luaQuote(s) {
  const escaped = String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return '"' + escaped + '"';
}

// --- Arithmetic camouflage -------------------------------------------------
/** Split number n into a random  a+b / a-b / a%b  expression evaluating to n. */
function camouflageNumber(n, rng) {
  const r = rng();
  if (r < 0.34) {
    const big = 100000 + Math.floor(rng() * 900000);
    return '(-' + big + '+' + (n + big) + ')';
  }
  if (r < 0.67) {
    const big = Math.abs(n) * 3 + 5000 + Math.floor(rng() * 10000);
    return '(' + (n + big) + '-' + big + ')';
  }
  // (k*b + n) % b == n   (b > |n| ensures correctness; only for n >= 0,
  // because Lua's % always yields a non-negative result for b > 0)
  if (n >= 0) {
    const b = n + 3 + Math.floor(rng() * 9999);
    const k = 3 + Math.floor(rng() * 97);
    const a = k * b + n;
    return '(' + a + '%' + b + ')';
  }
  const big = 5000 + Math.floor(rng() * 10000);
  return '(-' + (big - n) + '+' + big + ')'; // (-X + Y) == n where Y - X = n
}

// --- String pool extraction -------------------------------------------------
/**
 * Replace every string literal in the Lua source with R(idx) register calls.
 * Skips comments. Returns { code, pool } with pool = extracted strings.
 */
function extractStrings(src) {
  const code = String(src);
  const pool = [];
  let out = '';
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    // comments
    if (c === '-' && code[i + 1] === '-') {
      if (code[i + 2] === '[' && (code[i + 3] === '[' || code[i + 3] === '=')) {
        const eq = code[i + 3] === '[' ? '' : '='.repeat(code.slice(i + 3).match(/^=+/)[0].length);
        const close = code.indexOf(']' + eq + ']', i + 4);
        out += code.slice(i, close === -1 ? code.length : close + eq.length + 2);
        i = close === -1 ? code.length : close + eq.length + 2;
        continue;
      }
      let j = i;
      while (j < code.length && code[j] !== '\n') j++;
      out += code.slice(i, j);
      i = j;
      continue;
    }
    // long strings [[...]] used as literals
    if (c === '[' && code[i + 1] === '[') {
      const close = code.indexOf(']]', i + 2);
      if (close !== -1) {
        const val = code.slice(i + 2, close);
        const idx = pool.push(val) - 1;
        out += 'R(' + (idx + 1) + ')';
        i = close + 2;
        continue;
      }
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let val = '';
      while (j < code.length) {
        if (code[j] === '\\') {
          val += unescapeChar(code[j + 1]);
          j += 2;
          continue;
        }
        if (code[j] === c) break;
        val += code[j];
        j++;
      }
      const idx = pool.push(val) - 1;
      out += 'R(' + (idx + 1) + ')';
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return { code: out, pool };
}

function unescapeChar(c) {
  switch (c) {
    case 'n': return '\n';
    case 't': return '\t';
    case 'r': return '\r';
    case '\\': return '\\';
    case '"': return '"';
    case "'": return "'";
    case '\n': return '\n';
    default: return c;
  }
}

// --- permutation helpers -----------------------------------------------------
/** Compute minimal swap list (1-based indexes) turning `source` into `target`. */
function swapsFor(source, target) {
  const arr = source.slice();
  const swaps = [];
  for (let i = 0; i < target.length; i++) {
    if (arr[i] === target[i]) continue;
    let j = i + 1;
    while (j < arr.length && arr[j] !== target[i]) j++;
    if (j >= arr.length) break; // shouldn't happen for a true permutation
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    swaps.push([i + 1, j + 1]);
  }
  return swaps;
}

// --- seeded RNG ---------------------------------------------------------------
function hashSeed(s) {
  let h = 1779033703;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// MAIN OBFUSCATOR
// ---------------------------------------------------------------------------
function obfuscate(src, opts = {}) {
  const seed = opts.seed || String(Date.now() + Math.random());
  const rng = mulberry32(hashSeed(seed));

  // 1. Extract all strings -> payload code references R(idx)
  const { code, pool } = extractStrings(src);
  const n = pool.length;

  // 2. Base-85 encode each pool string (true order)
  const encodedTrue = pool.map((s) => encode85(utf8Bytes(s)));

  // 3. Build shuffled literal order + swap list that un-shuffles it at runtime
  const literal = encodedTrue.slice();
  for (let i = literal.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = literal[i];
    literal[i] = literal[j];
    literal[j] = tmp;
  }
  const swaps = swapsFor(literal, encodedTrue);

  // 4. Constants
  const K = 3 + Math.floor(rng() * 5); // index offset for S()
  const b85Lit = B85_ALPHABET.map((c) => luaQuote(c)).join(',');
  const b64Lit = B64_ALPHABET.map((c) => luaQuote(c)).join(',');
  const poolLit = literal.map((s) => luaQuote(s)).join(',');
  const swapCode = swaps.map(([a, b]) => 'U[' + a + '],U[' + b + ']=U[' + b + '],U[' + a + ']').join('\n');

  // marker + version
  const version = opts.version || '2.0.0';

  // 5. Assemble obfuscated program
  const parts = [];
  parts.push('--[[ obfuscated with Deobfuscator-Bot engine v' + version + ' (WeAreDevs-compatible architecture) ]]');
  parts.push('return (function(...)');
  parts.push('local U={' + poolLit + '}');
  if (swaps.length) {
    parts.push(swapCode);
  }
  parts.push('local o={' + b85Lit + '}');
  parts.push('local w={' + b64Lit + '}');
  parts.push('local q=string.char');
  parts.push('local Q=string.sub');
  parts.push('local l=table.concat');
  parts.push('local L=string.len');
  parts.push('local T=type');
  parts.push('local function S(x) return U[x+' + camouflageNumber(K, rng) + '] end');
  // D: decode one Base-85 chunk. 5 chars -> 4 bytes; 2-4 chars -> n-1 bytes
  // (short chunks are zero-padded on encode, and padded with the max digit 84 on decode)
  parts.push('local function D(s)');
  parts.push('  local n=L(s)');
  parts.push('  local v=' + camouflageNumber(0, rng));
  parts.push('  for i=1,n do');
  parts.push('    local c=Q(s,i,i)');
  parts.push('    for j=1,85 do');
  parts.push('      if o[j]==c then v=v*85+(j-' + camouflageNumber(1, rng) + ') break end');
  parts.push('    end');
  parts.push('  end');
  parts.push('  for i=n+' + camouflageNumber(1, rng) + ',5 do v=v*' + camouflageNumber(85, rng) + '+' + camouflageNumber(84, rng) + ' end');
  parts.push('  local b1=q(math.floor(v/' + camouflageNumber(16777216, rng) + ')%' + camouflageNumber(256, rng) + ')');
  parts.push('  local b2=q(math.floor(v/' + camouflageNumber(65536, rng) + ')%' + camouflageNumber(256, rng) + ')');
  parts.push('  local b3=q(math.floor(v/' + camouflageNumber(256, rng) + ')%' + camouflageNumber(256, rng) + ')');
  parts.push('  local b4=q(v%' + camouflageNumber(256, rng) + ')');
  parts.push('  if n>=' + camouflageNumber(5, rng) + ' then return b1..b2..b3..b4');
  parts.push('  elseif n==' + camouflageNumber(4, rng) + ' then return b1..b2..b3');
  parts.push('  elseif n==' + camouflageNumber(3, rng) + ' then return b1..b2');
  parts.push('  else return b1 end');
  parts.push('end');
  // DE: greedily parse full 5-char blocks; final 2-4 char tail = short block
  parts.push('local function DE(s)');
  parts.push('  local t={}');
  parts.push('  local i=' + camouflageNumber(1, rng));
  parts.push('  local n=L(s)');
  parts.push('  while i<=n do');
  parts.push('    local r=n-i+' + camouflageNumber(1, rng));
  parts.push('    if r>=' + camouflageNumber(5, rng) + ' then');
  parts.push('      t[#t+' + camouflageNumber(1, rng) + ']=D(Q(s,i,i+' + camouflageNumber(4, rng) + '))');
  parts.push('      i=i+' + camouflageNumber(5, rng));
  parts.push('    else');
  parts.push('      t[#t+' + camouflageNumber(1, rng) + ']=D(Q(s,i,i+r-' + camouflageNumber(1, rng) + '))');
  parts.push('      i=i+r');
  parts.push('    end');
  parts.push('  end');
  parts.push('  return l(t)');
  parts.push('end');
  parts.push('local Z={} local I={} local y=' + camouflageNumber(0, rng));
  parts.push('local function R(x) return Z[x] end');
  parts.push('local s=' + camouflageNumber(1, rng));
  parts.push('while s do');
  parts.push('  if s<' + camouflageNumber(2, rng) + ' then');
  parts.push('    y=y+' + camouflageNumber(1, rng));
  parts.push('    s=' + camouflageNumber(2, rng));
  parts.push('  elseif s<' + camouflageNumber(3, rng) + ' then');
  if (n > 0) {
    parts.push('    for i=' + camouflageNumber(1, rng) + ',' + camouflageNumber(n, rng) + ' do Z[i]=DE(S(i-' + camouflageNumber(K, rng) + ')) end');
  }
  parts.push('    s=' + camouflageNumber(3, rng));
  parts.push('  elseif s<' + camouflageNumber(4, rng) + ' then');
  parts.push('    Z[' + camouflageNumber(0, rng) + ']=getfenv and getfenv() or _ENV');
  parts.push('    s=' + camouflageNumber(4, rng));
  parts.push('  elseif s<' + camouflageNumber(5, rng) + ' then');
  parts.push('    local payload=function()');
  parts.push(indentCode(code, 6));
  parts.push('    end');
  parts.push('    Z[' + camouflageNumber(n + 2, rng) + ']=payload');
  parts.push('    s=' + camouflageNumber(5, rng));
  parts.push('  elseif s<' + camouflageNumber(6, rng) + ' then');
  parts.push('    I={Z[' + camouflageNumber(n + 2, rng) + ']()}');
  parts.push('    s=' + camouflageNumber(6, rng));
  parts.push('  else');
  parts.push('    s=nil');
  parts.push('  end');
  parts.push('end');
  parts.push('end)(...)');

  return parts.join('\n');
}

function indentCode(code, spaces) {
  const pad = ' '.repeat(spaces);
  return String(code)
    .split('\n')
    .map((l) => (l.trim() ? pad + l : l))
    .join('\n');
}

module.exports = {
  obfuscate,
  encode85,
  extractStrings,
  camouflageNumber,
  swapsFor,
  B85_ALPHABET,
  B64_ALPHABET,
};
