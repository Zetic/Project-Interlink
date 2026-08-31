import { metersToWorldUnits } from '../../world/scale.js';

/**
 * Engineering cards use the original 160x100 local drawing grammar, then the
 * complete card is transformed into the Earth-scale world footprint. Keeping
 * text at normal SVG font sizes avoids browser glyph culling at ~0.0001 user-unit
 * font sizes while preserving the same real-world card dimensions.
 */
export const NODE_CARD_LOCAL_WIDTH = 160;
export const NODE_CARD_LOCAL_HEIGHT = 100;
export const NODE_CARD_LOCAL_HEADER_HEIGHT = 20;
export const NODE_CARD_LOCAL_HALF_WIDTH = NODE_CARD_LOCAL_WIDTH / 2;
export const NODE_CARD_LOCAL_HALF_HEIGHT = NODE_CARD_LOCAL_HEIGHT / 2;
export const NODE_CARD_LOCAL_BODY_FONT_SIZE = 11;
export const NODE_CARD_LOCAL_CATEGORY_FONT_SIZE = 10;
export const NODE_CARD_LOCAL_PORT_RADIUS = 6;
export const NODE_CARD_PHYSICAL_WIDTH_METERS = 20;
export const NODE_CARD_PHYSICAL_HEIGHT_METERS = 12.5;
export const NODE_CARD_WORLD_WIDTH = metersToWorldUnits(NODE_CARD_PHYSICAL_WIDTH_METERS);
export const NODE_CARD_WORLD_HEIGHT = metersToWorldUnits(NODE_CARD_PHYSICAL_HEIGHT_METERS);
export const NODE_CARD_SCALE_X = NODE_CARD_WORLD_WIDTH / NODE_CARD_LOCAL_WIDTH;
export const NODE_CARD_SCALE_Y = NODE_CARD_WORLD_HEIGHT / NODE_CARD_LOCAL_HEIGHT;

export function localCardTransform(x: number, y: number): string {
  return `translate(${x} ${y}) scale(${NODE_CARD_SCALE_X} ${NODE_CARD_SCALE_Y})`;
}
