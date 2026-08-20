export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;

export function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToGraph(point, viewport) {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  };
}

export function translateGraphPosition(startPosition, startPointer, currentPointer) {
  return {
    x: startPosition.x + currentPointer.x - startPointer.x,
    y: startPosition.y + currentPointer.y - startPointer.y,
  };
}

export function boundsForNodePositions(nodePositions, nodeWidth = 0, nodeHeight = 0) {
  const positions = Object.values(nodePositions ?? {});
  if (!positions.length) {
    return { minX: 0, minY: 0, maxX: nodeWidth, maxY: nodeHeight };
  }

  return positions.reduce((bounds, position) => ({
    minX: Math.min(bounds.minX, position.x),
    minY: Math.min(bounds.minY, position.y),
    maxX: Math.max(bounds.maxX, position.x + nodeWidth),
    maxY: Math.max(bounds.maxY, position.y + nodeHeight),
  }), {
    minX: positions[0].x,
    minY: positions[0].y,
    maxX: positions[0].x + nodeWidth,
    maxY: positions[0].y + nodeHeight,
  });
}

export function zoomAroundPoint(viewport, zoom, point) {
  const nextZoom = clampZoom(zoom);
  const graphPoint = screenToGraph(point, viewport);
  return {
    ...viewport,
    zoom: nextZoom,
    panX: point.x - graphPoint.x * nextZoom,
    panY: point.y - graphPoint.y * nextZoom,
  };
}

export function fitViewport(viewport, bounds, size, padding = 40) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const zoom = clampZoom(Math.min(
    (size.width - padding * 2) / width,
    (size.height - padding * 2) / height,
  ));
  return {
    ...viewport,
    zoom,
    panX: (size.width - width * zoom) / 2 - bounds.minX * zoom,
    panY: (size.height - height * zoom) / 2 - bounds.minY * zoom,
  };
}

export function centerViewport(viewport, bounds, size) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  return {
    ...viewport,
    panX: size.width / 2 - (bounds.minX + width / 2) * viewport.zoom,
    panY: size.height / 2 - (bounds.minY + height / 2) * viewport.zoom,
  };
}
