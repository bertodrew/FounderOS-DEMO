export type ConnectorState = 'connected' | 'not_configured' | 'error';

export type ConnectorKind =
  | 'email'
  | 'calendar'
  | 'slack'
  | 'payments'
  | 'notion'
  | 'brain'
  | 'social'
  | 'crm'
  | 'ads'
  | 'creative'
  | 'knowledge'
  | 'local'
  | 'orchestration'
  | 'developer';

export type ConnectorStatus = {
  id: string;
  name: string;
  kind: ConnectorKind;
  state: ConnectorState;
  detail: string;
  meta?: Record<string, string | number>;
};
