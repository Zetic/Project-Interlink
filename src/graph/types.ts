import type { NodePort, Point } from '../world/types.js';

export type MechanicalNodeCategory = 'apparatus' | 'container';
export type MechanicalParameterValue = number | boolean | string;

export interface MechanicalNode {
  id: string;
  definitionId: string;
  nodeType: string;
  label: string;
  category: MechanicalNodeCategory;
  position: Point;
  physicalWidthMeters: number;
  physicalHeightMeters: number;
  ports: NodePort[];
  enabled: boolean;
  parameters: Record<string, MechanicalParameterValue>;
}

export interface PortEndpoint {
  nodeId: string;
  portId: string;
}

export interface NodeConnection {
  id: string;
  from: PortEndpoint;
  to: PortEndpoint;
  kind: NodePort['kind'];
  medium: NodePort['medium'];
}

export interface GraphState {
  nodes: MechanicalNode[];
  connections: NodeConnection[];
  nextNodeSequence: number;
  nextConnectionSequence: number;
}
