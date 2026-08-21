import { allConnectorStatuses } from '@/lib/connectors';
import { readEnvLocal } from '@/lib/creds';
import { connectionCatalog } from '@/lib/integrations-catalog';
import { PageHeader } from '@/components/PageHeader';
import { OnboardingWizard } from '@/components/OnboardingWizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const statuses = await allConnectorStatuses();
  const catalog = connectionCatalog(statuses, readEnvLocal());
  const detailByConnector = Object.fromEntries(statuses.map((s) => [s.id, s.detail]));

  return (
    <div>
      <PageHeader eyebrow="setup" title="Get connected" />
      <OnboardingWizard catalog={catalog} detailByConnector={detailByConnector} />
    </div>
  );
}
