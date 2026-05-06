export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}
