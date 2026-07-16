// scoring.js
// This is the "point system" the app is built around. Kept in its own file
// so it's easy to find and tune without digging through server.js.

/**
 * Estimate a one-rep max from a weight x reps set, using the Epley formula.
 * This lets a "225kg x 5 reps" post get compared fairly against a "265kg x 1" post.
 */
function estimateOneRepMax(weightKg, reps) {
  if (reps <= 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/**
 * Turn a lift into base points, scaled by the lifter's bodyweight.
 * ratio = estimated 1RM / bodyweight
 * A ratio of 1.0 (lifting your bodyweight) = 100 base points.
 * A ratio of 2.0 (lifting double bodyweight) = 200 base points.
 */
function calculateBasePoints(weightKg, reps, bodyweightKg) {
  const oneRepMax = estimateOneRepMax(weightKg, reps);
  const ratio = oneRepMax / bodyweightKg;
  return Math.round(ratio * 100);
}

module.exports = { estimateOneRepMax, calculateBasePoints };
