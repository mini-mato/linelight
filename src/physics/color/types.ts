/**
 * Color types.
 *
 * `RGBLinear` is normalized [0, 1] in the sRGB linear space (pre-gamma-encode).
 * `RGB` is normalized [0, 1] in the sRGB display space (post-gamma-encode).
 * `RGB8` is integer [0, 255] for HTML/CSS output.
 */

export type XYZ = readonly [number, number, number]
export type RGBLinear = readonly [number, number, number]
export type RGB = readonly [number, number, number]
export type RGB8 = { r: number; g: number; b: number }

export type ColorPipeline = 'cie1931' | 'bruton1996' | 'monochrome'
