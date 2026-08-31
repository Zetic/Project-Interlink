export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ResourceCategory = 'metallic' | 'industrial' | 'fuel' | 'volatile';

export interface ResourceDefinition {
  id: string;
  name: string;
  category: ResourceCategory;
}

export interface ResourceNode {
  id: string;
  name: string;
  resourceId: string;
  regionId: string;
  position: Point;
}

export interface Region {
  id: string;
  name: string;
  bounds: Bounds;
  polygon: Point[];
  resourceNodeIds: string[];
}

export interface Planet {
  id: string;
  seed: string;
  name: string;
  width: number;
  height: number;
  regions: Region[];
  resourceNodes: ResourceNode[];
}

export interface WorldState {
  planet: Planet;
}

export type MapSelection =
  | { type: 'planet' }
  | { type: 'region'; regionId: string }
  | { type: 'resource'; resourceNodeId: string };

export interface MapCameraState {
  centerX: number;
  centerY: number;
  zoom: number;
}

export interface AppState {
  world: WorldState | null;
  selection: MapSelection;
  camera: MapCameraState;
}
