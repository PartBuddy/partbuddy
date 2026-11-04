import { AssistantPanel } from './assistant/AssistantPanel';
import { useAssistantBridge } from './assistant/useAssistantBridge';
import { StatusBar } from './shell/StatusBar';
import { TitleBar } from './shell/TitleBar';
import { useMirror } from './viewer/useMirror';
import { Viewer } from './viewer/Viewer';

export function App() {
  useMirror();
  useAssistantBridge();
  return (
    <div className="flex h-full flex-col bg-canvas text-text">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Viewer />
        <AssistantPanel />
      </div>
      <StatusBar />
    </div>
  );
}
