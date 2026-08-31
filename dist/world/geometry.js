export function polygonBounds(points) {
    if (points.length === 0)
        return { x: 0, y: 0, width: 0, height: 0 };
    let minX = points[0].x;
    let minY = points[0].y;
    let maxX = minX;
    let maxY = minY;
    for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
export function polygonCentroid(points) {
    if (points.length === 0)
        return { x: 0, y: 0 };
    let signedArea = 0;
    let centroidX = 0;
    let centroidY = 0;
    for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        const cross = current.x * next.y - next.x * current.y;
        signedArea += cross;
        centroidX += (current.x + next.x) * cross;
        centroidY += (current.y + next.y) * cross;
    }
    signedArea *= 0.5;
    if (Math.abs(signedArea) < 1e-6) {
        const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
        return { x: total.x / points.length, y: total.y / points.length };
    }
    const scale = 1 / (6 * signedArea);
    return { x: centroidX * scale, y: centroidY * scale };
}
export function pointInPolygon(point, polygon) {
    let inside = false;
    for (let currentIndex = 0, previousIndex = polygon.length - 1; currentIndex < polygon.length; previousIndex = currentIndex, currentIndex += 1) {
        const current = polygon[currentIndex];
        const previous = polygon[previousIndex];
        const intersects = ((current.y > point.y) !== (previous.y > point.y))
            && (point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x);
        if (intersects)
            inside = !inside;
    }
    return inside;
}
