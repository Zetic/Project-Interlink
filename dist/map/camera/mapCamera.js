export const MAP_MIN_ZOOM = 1;
export const MAP_MAX_ZOOM = 2 ** 24;
export const MECHANICAL_PLACEMENT_MIN_ZOOM = 2 ** 17;
export const WHEEL_GEOGRAPHIC_SENSITIVITY = 0.0015;
export const WHEEL_ENGINEERING_SENSITIVITY = 0.00035;
export const WHEEL_ENGINEERING_BLEND_START_ZOOM = 2 ** 14;
export const WHEEL_ENGINEERING_BLEND_END_ZOOM = 2 ** 18;
export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
export function smoothStep(value) {
    const clamped = clamp(value, 0, 1);
    return clamped * clamped * (3 - 2 * clamped);
}
export function wheelSensitivityForZoom(zoom) {
    const logZoom = Math.log2(Math.max(MAP_MIN_ZOOM, zoom));
    const start = Math.log2(WHEEL_ENGINEERING_BLEND_START_ZOOM);
    const end = Math.log2(WHEEL_ENGINEERING_BLEND_END_ZOOM);
    const engineeringWeight = smoothStep((logZoom - start) / (end - start));
    return WHEEL_GEOGRAPHIC_SENSITIVITY
        + (WHEEL_ENGINEERING_SENSITIVITY - WHEEL_GEOGRAPHIC_SENSITIVITY) * engineeringWeight;
}
export function wheelZoomAfterDelta(zoom, deltaPixels) {
    return clamp(zoom * Math.exp(-deltaPixels * wheelSensitivityForZoom(zoom)), MAP_MIN_ZOOM, MAP_MAX_ZOOM);
}
export function normalizeWheelDelta(event, viewportHeight) {
    let deltaPixels = event.deltaY;
    if (event.deltaMode === 1)
        deltaPixels *= 16;
    else if (event.deltaMode === 2)
        deltaPixels *= Math.max(1, viewportHeight);
    return clamp(deltaPixels, -240, 240);
}
export function camerasEqual(left, right) {
    const positionTolerance = 1e-9;
    const zoomTolerance = Math.max(1e-9, Math.max(Math.abs(left.zoom), Math.abs(right.zoom)) * 1e-10);
    return Math.abs(left.centerX - right.centerX) < positionTolerance
        && Math.abs(left.centerY - right.centerY) < positionTolerance
        && Math.abs(left.zoom - right.zoom) < zoomTolerance;
}
export function formatZoomFactor(zoom) {
    if (zoom < 10)
        return `${Math.round(zoom * 100)}%`;
    if (zoom < 1000)
        return `${Math.round(zoom)}×`;
    if (zoom < 1_000_000) {
        const thousands = zoom / 1000;
        return `${thousands >= 100 ? thousands.toFixed(0) : thousands.toFixed(1)}K×`;
    }
    const millions = zoom / 1_000_000;
    return `${millions >= 10 ? millions.toFixed(1) : millions.toFixed(2)}M×`;
}
export function visibleWorldSize(svg, planet, zoom) {
    const rect = svg.getBoundingClientRect();
    const viewportAspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : planet.width / planet.height;
    const planetAspect = planet.width / planet.height;
    let fitWidth = planet.width;
    let fitHeight = planet.height;
    if (viewportAspect > planetAspect)
        fitWidth = planet.height * viewportAspect;
    else
        fitHeight = planet.width / viewportAspect;
    return { width: fitWidth / zoom, height: fitHeight / zoom };
}
export function clampCamera(svg, planet, camera) {
    const zoom = clamp(camera.zoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
    const visible = visibleWorldSize(svg, planet, zoom);
    const centerX = visible.width >= planet.width ? planet.width / 2 : clamp(camera.centerX, visible.width / 2, planet.width - visible.width / 2);
    const centerY = visible.height >= planet.height ? planet.height / 2 : clamp(camera.centerY, visible.height / 2, planet.height - visible.height / 2);
    return { centerX, centerY, zoom };
}
