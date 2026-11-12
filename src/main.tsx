import '@mantine/core/styles.css';
import '@mantine/dropzone/styles.css';
import { createTheme, MantineProvider } from '@mantine/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const theme = createTheme({ primaryColor: 'teal', defaultRadius: 'md' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <App />
    </MantineProvider>
  </StrictMode>,
);
