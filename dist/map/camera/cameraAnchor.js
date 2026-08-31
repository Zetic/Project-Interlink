export function worldPointAtNormalizedScreen(camera, visible, screen) {
    return {
        x: camera.centerX + (screen.x - 0.5) * visible.width,
        y: camera.centerY + (screen.y - 0.5) * visible.height,
    };
}
/**
 * Derives camera center from an invariant world/screen anchor. The center is never
 * interpolated independently during wheel zoom, so the anchored world point cannot
 * perform the old lateral/vertical "wave" while zoom is easing.
 */
export function cameraForAnchor(anchor, visible, zoom) {
    return {
        centerX: anchor.world.x - (anchor.screen.x - 0.5) * visible.width,
        centerY: anchor.world.y - (anchor.screen.y - 0.5) * visible.height,
        zoom,
    };
}
