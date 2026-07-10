import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { PlaygroundController } from './controller.ts';
import './styles.css';

const controller = new PlaygroundController();
const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <App controller={controller} />
  </StrictMode>,
);

// On a hot update, tear down the tree and release the controller's audio
// resources before the new module graph loads — otherwise a live microphone
// is stranded across the reload with no handle left to stop it.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void controller.dispose();
    root.unmount();
  });
}
