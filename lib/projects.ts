/**
 * The project portfolio: Alex's other ventures, each a separate GitHub repo
 * deployed on Vercel. Single source of truth for lib/seed.ts (projects table +
 * their per-project agents), lib/agents/project-agents.ts (runtime), and
 * app/projects (the portfolio board) — add a project here once, everything
 * downstream picks it up.
 */

export type ProjectDef = {
  id: string;
  name: string;
  repoOwner: string;
  repoName: string;
  /** null when the project isn't deployed on Vercel (e.g. self-hosted). */
  vercelProjectId: string | null;
  description: string;
  color: string;
  order: number;
};

export const PROJECTS: ProjectDef[] = [
  {
    id: 'proj-aerocharter',
    name: 'AeroCharter',
    repoOwner: 'bertodrew',
    repoName: 'aerocharter',
    vercelProjectId: 'prj_tmvw6jXFJ7BKQxcHNYg3msBFYKOj',
    description: 'Private jet charter booking platform.',
    color: '#3df08c',
    order: 1,
  },
  {
    id: 'proj-telemedicina',
    name: 'Telemedicina',
    repoOwner: 'bertodrew',
    repoName: 'telemedicina',
    vercelProjectId: 'prj_KBRKGmLUZHXLehdW5IuaSI2IU0HA',
    description: 'Telehealth consultation platform.',
    color: '#ffc53d',
    order: 2,
  },
  {
    id: 'proj-techlounges',
    name: 'TechLounges',
    repoOwner: 'bertodrew',
    repoName: 'techlounges-site',
    vercelProjectId: 'prj_9C6v8VdsI0Cho6zWFDaY3jgzjuUw',
    description: 'Co-working / tech lounge venue site.',
    color: '#ff6259',
    order: 3,
  },
  {
    id: 'proj-odoo-hr',
    name: 'Odoo HR',
    repoOwner: 'bertodrew',
    repoName: 'Odoo-HR',
    vercelProjectId: null, // self-hosted — not a Vercel deployment
    description: 'Internal HR module on Odoo.',
    color: '#8f9eff',
    order: 4,
  },
];

export type ProjectRoleKey = 'support' | 'customer-service' | 'account' | 'marketing';

export type ProjectRoleDef = {
  key: ProjectRoleKey;
  title: string;
  departmentId: string;
  /** Nests this role under its department's existing lead agent in the org
   *  chart — matters for tree-layout spacing and for any "is this a lead?"
   *  heuristic elsewhere that keys off parentId === null. */
  parentId: string;
  tools: string[];
  model: string;
  description: (project: ProjectDef) => string;
  sopTitle: string;
  sopSummary: (project: ProjectDef) => string;
  sopSteps: (project: ProjectDef) => string[];
};

export const PROJECT_ROLES: ProjectRoleDef[] = [
  {
    key: 'support',
    title: 'Support',
    departmentId: 'dept-clients',
    parentId: 'client-roster',
    tools: ['email', 'slack'],
    model: 'imapflow + @slack/web-api',
    description: (p) => `Technical support triage for ${p.name} — shared inbox/Slack until a dedicated channel is connected.`,
    sopTitle: 'Triage technical support requests',
    sopSummary: (p) => `Keep ${p.name}'s support queue honest: real inbox status, no invented tickets.`,
    sopSteps: (p) => [
      `Check the shared support inbox and Slack channel for ${p.name} mentions`,
      'Triage by severity and tag with the project so it can be split out later',
      'Escalate anything touching a live incident to the Account agent',
      `Connect a dedicated ${p.name} inbox once volume justifies it`,
      'Report the queue depth honestly — never a fake "all clear"',
    ],
  },
  {
    key: 'customer-service',
    title: 'Customer Service',
    departmentId: 'dept-clients',
    parentId: 'client-roster',
    tools: ['email'],
    model: 'imapflow',
    description: (p) => `General customer service for ${p.name} — shared inbox until a dedicated one is connected.`,
    sopTitle: 'Answer general customer questions',
    sopSummary: (p) => `First response for ${p.name} customers — billing, account, and product questions.`,
    sopSteps: (p) => [
      `Read the shared inbox for ${p.name}-tagged messages`,
      'Answer from the project FAQ/knowledge base when one exists',
      'Route billing questions to the Account agent, bugs to Support',
      'Log unanswered questions as knowledge gaps',
      `Connect a dedicated ${p.name} inbox once volume justifies it`,
    ],
  },
  {
    key: 'account',
    title: 'Account',
    departmentId: 'dept-finance',
    parentId: 'payments-pulse',
    tools: ['payments', 'odoo'],
    model: 'stripe api + odoo json-rpc',
    description: (p) => `Billing and account health for ${p.name}.`,
    sopTitle: 'Track account and billing health',
    sopSummary: (p) => `Payments and account status for ${p.name}, from whichever processor is actually connected.`,
    sopSteps: (p) => [
      'Check which payment processor and Odoo instance are configured',
      `Pull the latest ${p.name} balance/charges snapshot when connected`,
      'Flag failed charges and overdue invoices',
      'Reconcile against Odoo HR/CRM records when applicable',
      'Report honestly when nothing is connected yet, never a stand-in number',
    ],
  },
  {
    key: 'marketing',
    title: 'Marketing',
    departmentId: 'dept-marketing-growth',
    parentId: 'social-agent',
    tools: ['riona'],
    model: 'riona-ai-agent',
    description: (p) => `Instagram growth for ${p.name} via Riona — shared instance until a dedicated IG account is connected.`,
    sopTitle: 'Run Instagram growth via Riona',
    sopSummary: (p) => `Instagram engagement for ${p.name} through the shared Riona AI agent.`,
    sopSteps: (p) => [
      'Check the Riona AI service is reachable (RIONA_BASE_URL)',
      `Log into the ${p.name} Instagram account once a dedicated one is connected`,
      'Run an interaction pass (like/comment) on the target feed',
      'Track follower and engagement deltas over time',
      'Report honestly when the service or account is not yet configured',
    ],
  },
];

export function projectAgentId(project: ProjectDef, role: ProjectRoleDef): string {
  return `${project.id}-${role.key}`;
}

/** Every project agent id, for views that need to exclude the portfolio's
 *  agents from the five-pillar org chart / knowledge graph (they live on
 *  /projects instead, so those visualizations keep their original density). */
export const PROJECT_AGENT_IDS: Set<string> = new Set(
  PROJECTS.flatMap((p) => PROJECT_ROLES.map((role) => projectAgentId(p, role))),
);
