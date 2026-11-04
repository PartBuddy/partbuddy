import { StatusBar } from './shell/StatusBar';
import { TitleBar } from './shell/TitleBar';
import { useMirror } from './viewer/useMirror';
import { Viewer } from './viewer/Viewer';

export function App() {
  useMirror();
  return (
    <div className="flex h-full flex-col bg-canvas text-text">
      <TitleBar />
      <Viewer />
      <StatusBar />
    </div>
  );
}
