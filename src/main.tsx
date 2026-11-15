import '@mantine/core/styles.css';
import '@mantine/dropzone/styles.css';
import { createTheme, DirectionProvider, MantineProvider } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider, loadMessages, RTL } from './i18n';
import { initialLocale } from './route';

const theme = createTheme({ primaryColor: 'teal', defaultRadius: 'md' });
const locale = initialLocale();

// Offline support and "install app". Not in dev, where a cache would hide code changes.
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

// Load the language first so a translated page does not flash English.
loadMessages(locale).then((messages) =>
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DirectionProvider initialDirection={RTL.has(locale) ? 'rtl' : 'ltr'} detectDirection>
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <I18nProvider initial={locale} messages={messages}>
          <App />
        </I18nProvider>
      </MantineProvider>
    </DirectionProvider>
  </StrictMode>,
  ),
);
