export type PortDirection = 'input' | 'output';
export type SystemNodeKind = 'primitive' | 'composite' | string;

export interface SystemPort {
  id: string;
  direction: PortDirection;
  kind: string;
  label: string;
  childNodeId: string | null;
  childPortId: string | null;
  accepts: readonly string[];
  provides: readonly string[];
  runtimePortField?: string;
}

export interface SystemPortInput {
  id: string;
  direction: PortDirection;
  kind?: string;
  label?: string;
  childNodeId?: string | null;
  childPortId?: string | null;
  accepts?: readonly string[];
  provides?: readonly string[];
  runtimePortField?: string;
}

export interface SystemNode {
  id: string;
  nodeType: string;
  systemType: string;
  kind: SystemNodeKind;
  ports: SystemPort[];
  inspectableState: Record<string, unknown>;
  childWorkspaceId: string | null;
}

export interface SystemNodeInput {
  id: string;
  nodeType: string;
  systemType?: string;
  kind?: SystemNodeKind;
  ports?: readonly SystemPortInput[];
  inspectableState?: Record<string, unknown>;
  childWorkspaceId?: string | null;
}

export interface SystemWorkspace {
  nodes: Record<string, SystemNode>;
}

export interface BoundaryResolution {
  boundaryPort: SystemPort | null;
  node: SystemNode | null;
  port: SystemPort | null;
}
