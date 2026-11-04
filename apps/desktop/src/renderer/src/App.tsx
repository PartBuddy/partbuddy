import { AssistantPanel } from './assistant/AssistantPanel';
import { useAssistantBridge } from './assistant/useAssistantBridge';
import { useNotesBridge } from './notes/useNotesBridge';
import { useVariantsBridge } from './variants/useVariantsBridge';
import { VariantStrip } from './variants/VariantStrip';
import { StatusBar } from './shell/StatusBar';
import { StructurePanel } from './shell/StructurePanel';
import { Timeline } from './shell/Timeline';
import { TitleBar } from './shell/TitleBar';
import { useMirror } from './viewer/useMirror';
import { Viewer } from './viewer/Viewer';

export function App() {
  useMirror();
  useAssistantBridge();
  useNotesBridge();
  useVariantsBridge();
  return (
    <div className="flex h-full flex-col bg-canvas text-text">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <StructurePanel />
        <div className="flex min-w-0 flex-1 flex-col">
          <Viewer />
          <VariantStrip />
          <Timeline />
        </div>
        <AssistantPanel />
      </div>
      <StatusBar />
    </div>
  );
}
