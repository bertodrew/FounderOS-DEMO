import { getDb } from '@/lib/data';
import { runtimeEnv } from '@/lib/creds';
import { githubStatus } from '@/lib/connectors/github';
import { vercelStatus, latestDeployment } from '@/lib/connectors/vercel';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Dot, SectionHead, type BadgeTone } from '@/components/terminal';
import type { Project, Agent } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

async function projectDeployBadge(
  project: Project,
  env: Record<string, string | undefined>,
): Promise<{ label: string; tone: BadgeTone }> {
  if (!project.vercelProjectId) return { label: 'self-hosted', tone: 'default' };
  const info = await latestDeployment(project.vercelProjectId, env);
  if (info.state !== 'connected') return { label: info.detail, tone: 'default' };
  const ready = info.readyState === 'READY';
  return { label: info.detail, tone: ready ? 'ok' : 'warn' };
}

export default async function ProjectsPage() {
  const db = getDb();
  const env = runtimeEnv();
  const projects = db.projects.all();
  const agentsByProject = new Map<string, Agent[]>();
  for (const a of db.agents.all()) {
    if (!a.projectId) continue;
    agentsByProject.set(a.projectId, [...(agentsByProject.get(a.projectId) ?? []), a]);
  }

  const [github, vercel] = await Promise.all([githubStatus(env), vercelStatus(env)]);
  const deployBadges = await Promise.all(projects.map((p) => projectDeployBadge(p, env)));

  return (
    <div>
      <PageHeader
        eyebrow="portfolio"
        title="Projects"
        right={
          <div className="flex gap-2">
            <Badge tone={github.state === 'connected' ? 'ok' : 'default'}>
              <Dot state={github.state} /> GitHub {github.state}
            </Badge>
            <Badge tone={vercel.state === 'connected' ? 'ok' : 'default'}>
              <Dot state={vercel.state} /> Vercel {vercel.state}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {projects.map((project, i) => {
          const agents = agentsByProject.get(project.id) ?? [];
          const deploy = deployBadges[i];
          return (
            <div key={project.id} className="rounded-sm-t border border-os-border bg-os-surface p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: project.color }} />
                  <h2 className="text-[15px] font-bold text-os-text">{project.name}</h2>
                </div>
                <Badge tone={deploy.tone}>{deploy.label}</Badge>
              </div>
              <p className="mb-2 text-[12.5px] text-os-muted">{project.description}</p>
              <a
                href={`https://github.com/${project.repoOwner}/${project.repoName}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-os-dim hover:text-os-accent"
              >
                {project.repoOwner}/{project.repoName}
              </a>

              <div className="mb-2 mt-4">
                <SectionHead label="Agents" count={agents.length} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2 rounded-sm-t border border-os-border px-2.5 py-2 text-[12px]"
                  >
                    <Dot state={agent.status} />
                    <span className="truncate text-os-text">{agent.role}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
