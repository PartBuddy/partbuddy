import { IconCheck, IconChevronDown, IconCloud, IconDeviceDesktop } from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import { findProvider, minimumAgentContext, providers, type ProviderProfile } from '../mock/providers';
import { useStudio, type LocalServerState } from '../state/store';
import { StatusDot, type Tone } from '../ui/Badge';
import { Menu, MenuButton, MenuItem, MenuSection } from '../ui/Menu';

export function providerStatus(
  provider: ProviderProfile,
  localServer: LocalServerState,
): { tone: Tone; key: string } {
  if (provider.kind === 'cloud') return { tone: 'success', key: 'provider.status.ready' };
  if (localServer === 'unreachable') return { tone: 'danger', key: 'provider.status.unreachable' };
  if (localServer === 'processing') return { tone: 'info', key: 'provider.status.processing' };
  if (provider.contextTokens < minimumAgentContext) return { tone: 'warning', key: 'provider.status.smallContext' };
  if (!provider.tools) return { tone: 'warning', key: 'provider.status.noTools' };
  return { tone: 'success', key: 'provider.status.ready' };
}

function capabilities(provider: ProviderProfile, t: TFunction, locale: string) {
  const context = new Intl.NumberFormat(locale, { notation: 'compact' }).format(provider.contextTokens);
  return [
    t('provider.context', { context }),
    provider.tools ? t('provider.tools') : t('provider.noTools'),
    provider.images ? t('provider.images') : null,
    provider.endpoint ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function ProviderMenu() {
  const { t, i18n } = useTranslation();
  const providerId = useStudio((s) => s.providerId);
  const setProvider = useStudio((s) => s.setProvider);
  const localServer = useStudio((s) => s.localServer);
  const current = findProvider(providerId);
  const status = providerStatus(current, localServer);
  const cloud = providers.filter((p) => p.kind === 'cloud');
  const local = providers.filter((p) => p.kind === 'local');

  const item = (provider: ProviderProfile) => {
    const s = providerStatus(provider, localServer);
    const Icon = provider.kind === 'cloud' ? IconCloud : IconDeviceDesktop;
    return (
      <MenuItem key={provider.id} id={provider.id} textValue={`${provider.vendor} ${provider.model}`}>
        <Icon className="size-icon shrink-0 text-text-muted" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <span className="font-medium">{provider.model}</span>
            <span className="text-sm text-text-muted">{provider.vendor}</span>
          </span>
          <span className="text-xs text-text-subtle">{capabilities(provider, t, i18n.language)}</span>
          <StatusDot tone={s.tone} label={t(s.key)} />
        </span>
        {provider.id === providerId ? <IconCheck className="size-icon text-accent-text" aria-hidden /> : null}
      </MenuItem>
    );
  };

  return (
    <MenuButton
      trigger={
        <AriaButton
          aria-label={t('provider.menuLabel', {
            model: current.model,
            source: current.kind === 'local' ? t('provider.local') : current.vendor,
            status: t(status.key),
          })}
          className="flex h-control-md items-center gap-2 rounded-md border border-border px-2 text-md text-text outline-none hovered:bg-surface-hover pressed:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus"
        >
          <StatusDot tone={status.tone} label="" />
          <span className="font-medium">{current.model}</span>{' '}
          <span className="text-sm text-text-muted">{current.kind === 'local' ? t('provider.local') : current.vendor}</span>
          <IconChevronDown className="size-icon-sm text-text-muted" aria-hidden />
        </AriaButton>
      }
    >
      <Menu
        aria-label={t('provider.menuTitle')}
        selectionMode="single"
        selectedKeys={[providerId]}
        onAction={(key) => {
          setProvider(String(key));
        }}
      >
        <MenuSection title={t('provider.cloud')}>{cloud.map(item)}</MenuSection>
        <MenuSection title={t('provider.localServers')}>{local.map(item)}</MenuSection>
      </Menu>
    </MenuButton>
  );
}
