import { Button, Popover, Text } from '@mantine/core';
import { IconDeviceMobileDown } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useI18n } from './i18n';

// Chrome and Edge fire this when the app can be installed. It can fire before React starts, so listen at load.
type InstallPrompt = Event & { prompt: () => Promise<void> };
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPrompt;
  listeners.forEach((f) => f());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  listeners.forEach((f) => f());
});

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
// iPads report as Macs; touch points tell them apart.
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** "Install app" button: the browser prompt where there is one, else steps for iPhone and iPad. */
export function InstallButton() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState(deferred);
  useEffect(() => {
    const update = () => setPrompt(deferred);
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);

  if (standalone()) return null;
  const button = (onClick?: () => void) => (
    <Button variant="light" leftSection={<IconDeviceMobileDown size={18} />} onClick={onClick}>
      {t('install.button')}
    </Button>
  );
  if (prompt) return button(() => prompt.prompt().finally(() => setPrompt((deferred = null))));
  if (!isIos()) return null;
  return (
    <Popover width={260} withArrow shadow="md">
      <Popover.Target>{button()}</Popover.Target>
      <Popover.Dropdown>
        <Text size="sm">{t('install.ios')}</Text>
      </Popover.Dropdown>
    </Popover>
  );
}
