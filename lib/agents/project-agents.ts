/**
 * Runtime agents for the project portfolio (lib/projects.ts). Structure
 * first: each run() reports the real status of the connector its role would
 * use, honestly, rather than pretending to work a real support ticket before
 * a dedicated inbox/IG account exists per project. No larp — every id here
 * satisfies tests/seed.test.ts's "every seeded agent maps to a real runtime
 * agent" check.
 */
import { emailStatus } from '@/lib/connectors/email';
import { slackStatus } from '@/lib/connectors/slack';
import { paymentsStatus } from '@/lib/connectors/payments';
import { odooStatus } from '@/lib/connectors/odoo';
import { rionaStatus } from '@/lib/connectors/riona';
import { runtimeEnv } from '@/lib/creds';
import { PROJECTS, PROJECT_ROLES, projectAgentId, type ProjectDef, type ProjectRoleDef } from '@/lib/projects';
import type { AgentRunResult, RuntimeAgent } from '@/lib/agents/runtime';

async function runForRole(project: ProjectDef, role: ProjectRoleDef): Promise<AgentRunResult> {
  const env = runtimeEnv();
  switch (role.key) {
    case 'support':
    case 'customer-service': {
      const [email, slack] = await Promise.all([emailStatus(env), slackStatus(env)]);
      const live = email.state === 'connected' || slack.state === 'connected';
      return {
        ok: live,
        summary: `${project.name} ${role.title}: email ${email.state} · Slack ${slack.state}${
          live ? ' — shared inbox/channel, not yet split per project' : ' — connect an inbox and Slack channel'
        }`,
        data: { email: email.state, slack: slack.state },
      };
    }
    case 'account': {
      const [payments, odoo] = await Promise.all([paymentsStatus(env), odooStatus(env)]);
      const live = payments.state === 'connected' || odoo.state === 'connected';
      return {
        ok: live,
        summary: `${project.name} Account: payments ${payments.state} · Odoo ${odoo.state}`,
        data: { payments: payments.state, odoo: odoo.state },
      };
    }
    case 'marketing': {
      const riona = await rionaStatus(env);
      return {
        ok: riona.state === 'connected',
        summary: `${project.name} Marketing (Riona): ${riona.detail}${
          riona.state === 'connected' ? ' — shared IG account, not yet split per project' : ''
        }`,
        data: riona.meta,
      };
    }
  }
}

export const projectAgents: RuntimeAgent[] = PROJECTS.flatMap((project) =>
  PROJECT_ROLES.map((role) => ({
    id: projectAgentId(project, role),
    name: `${project.name} ${role.title}`,
    description: role.description(project),
    departmentId: role.departmentId,
    run: () => runForRole(project, role),
  })),
);
