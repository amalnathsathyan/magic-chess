/**
 * The board's width for the current window. Phones get the full width less the
 * page gutters. From the lg breakpoint the board shares the row with a 360px
 * side panel and is sized to fit the window's height, so the whole board and
 * both player rows stay on screen.
 */
export function fitBoardWidth(): number {
  const { innerWidth, innerHeight } = window;
  if (innerWidth < 1024) return Math.min(600, Math.max(280, innerWidth - 32));
  const byWidth = innerWidth - 48 - 360 - 32;
  const byHeight = innerHeight - 56 - 220;
  return Math.round(Math.min(680, Math.max(400, Math.min(byWidth, byHeight))));
}
