import { AssistantPanel } from './assistant/AssistantPanel';
import { useAssistantBridge, useChatPersistence } from './assistant/useAssistantBridge';
import { useNotesBridge } from './notes/useNotesBridge';
import { PrintProfilesDialog } from './print/PrintProfilesDialog';
import { usePrintBridge } from './print/usePrintBridge';
import { StatusBar } from './shell/StatusBar';
import { StructurePanel } from './shell/StructurePanel';
import { Timeline } from './shell/Timeline';
import { TitleBar } from './shell/TitleBar';
import { useMirror } from './viewer/useMirror';
import { Viewer } from './viewer/Viewer';

export function App() {
  useMirror();
  useAssistantBridge();
  useChatPersistence();
  useNotesBridge();
  usePrintBridge();
  return (
    <div className="flex h-full flex-col bg-canvas text-text">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <StructurePanel />
        <div className="flex min-w-0 flex-1 flex-col">
          <Viewer />
          <Timeline />
        </div>
        <AssistantPanel />
      </div>
      <StatusBar />
      <PrintProfilesDialog />
    </div>
  );
}
