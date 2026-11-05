import { AssistantPanel } from './assistant/AssistantPanel';
import { HomePage } from './home/HomePage';
import { useProjectPreview } from './home/useProjectPreview';
import { useAssistantBridge, useChatPersistence } from './assistant/useAssistantBridge';
import { useNotesBridge } from './notes/useNotesBridge';
import { FileDrop } from './shell/FileDrop';
import { SettingsDialog } from './shell/SettingsDialog';
import { usePrintBridge } from './print/usePrintBridge';
import { usePrintCheck } from './print/usePrintCheck';
import { StatusBar } from './shell/StatusBar';
import { StructurePanel } from './shell/StructurePanel';
import { Timeline } from './shell/Timeline';
import { TitleBar } from './shell/TitleBar';
import { useStartPage } from './home/useStartPage';
import { useStudio } from './state/store';
import { useMirror } from './viewer/useMirror';
import { Viewer } from './viewer/Viewer';

export function App() {
  useMirror();
  useAssistantBridge();
  useChatPersistence();
  useNotesBridge();
  usePrintBridge();
  usePrintCheck();
  useProjectPreview();
  const homeOpen = useStudio((s) => s.homeOpen);
  useStartPage();
  return (
    <div className="flex h-full flex-col bg-canvas text-text">
      <TitleBar />
      <div className="relative flex min-h-0 flex-1">
        {/* The work area stays mounted under the start page (B3), so the view and the chat keep their state. */}
        <div className="flex min-h-0 min-w-0 flex-1" inert={homeOpen}>
          <StructurePanel />
          <div className="flex min-w-0 flex-1 flex-col">
            <Viewer />
            <Timeline />
          </div>
          <AssistantPanel />
        </div>
        {homeOpen ? <HomePage /> : null}
      </div>
      <StatusBar />
      <SettingsDialog />
      <FileDrop />
    </div>
  );
}
