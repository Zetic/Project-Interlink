import type { ResourceSourceDefinition } from '../material/types.js';

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

export type NodePortDirection = 'input' | 'output';
export type NodePortKind = 'resource-access' | 'material';
export type NodePortMedium = 'resource' | 'solid' | 'gas';

export interface NodePort {
  id: string;
  direction: NodePortDirection;
  kind: NodePortKind;
  medium: NodePortMedium;
  label: string;
}

/**
 * A FEATURE is a naturally generated world entity. It is not a Site, child
 * workspace, or ResourceOccurrence hierarchy. The source descriptor is initial
 * authoring data that can be compiled into the Rust runtime.
 */
export interface ResourceNode {
  id: string;
  name: string;
  resourceId: string;
  regionId: string;
  position: Point;
  nodeType: 'feature';
  featureType: 'mineral-deposit';
  source: ResourceSourceDefinition;
  resourceAccessPortId: 'resource-access';
  ports: NodePort[];
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
  physicalWidthMeters: number;
  physicalHeightMeters: number;
  regions: Region[];
  resourceNodes: ResourceNode[];
}

export interface WorldState {
  planet: Planet;
}

export type MapSelection =
  | { type: 'planet' }
  | { type: 'region'; regionId: string }
  | { type: 'resource'; resourceNodeId: string }
  | { type: 'mechanical'; mechanicalNodeId: string };

export interface MapCameraState {
  centerX: number;
  centerY: number;
  zoom: number;
}
