import type { BionicSettings, ReaderDisplay } from './ui/Settings';
import type { FlowingSettings } from './pacer/modes/FlowingHighlight';
import type { RsvpSettings } from './pacer/modes/Rsvp';
import type { ChunkSettings } from './pacer/modes/ChunkHighlight';

export const DEFAULT_BIONIC: BionicSettings = {
  enabled: true,
  intensity: 'medium',
};

export const DEFAULT_DISPLAY: ReaderDisplay = { fontSize: 1.125, lineLength: 42 };

export const DEFAULT_FLOWING: FlowingSettings = { lead: 1 };

export const DEFAULT_RSVP: RsvpSettings = {
  fontSize: 3,
  showContext: true,
  contextLines: 3,
};

export const DEFAULT_CHUNK: ChunkSettings = { chunkSize: 3 };
