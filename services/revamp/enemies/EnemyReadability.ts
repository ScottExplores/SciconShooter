/**
 * REVAMP(P): Uniform simulation scale, including collision and formation slots.
 *
 * A .68 authored grid drone becomes 44×44 world pixels (previously 36×36).
 * That retains a ~33 px body on a 360×640 phone's letterboxed 390×844 arena.
 * Six columns still fit with the formation solver's five-pixel clearance.
 * No viewport, quality, or accessibility preference changes this value; bosses
 * have their own authored sizing and never use this regular-enemy multiplier.
 */
export const READABLE_REGULAR_ENEMY_SCALE = 1.35;
